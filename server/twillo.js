//set Twilio AccountSID and AuthToken
twilio = Twilio('YOUR_TWILIO_ACCOUNTSID', 'YOUR_TWILIO_AUTH_TOKEN');

//##Uber Auth methods##

// checks whether a string parses as JSON
var isJSON = function (str) {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
};

// getTokenResponse returns an object containing:
// - accessToken
// - expiresIn: lifetime of token in seconds
var getTokenResponse = function (query) {
  var config = ServiceConfiguration.configurations.findOne({service: 'uber'});
  if (!config)
    throw new ServiceConfiguration.ConfigError("Service not configured");
  var responseContent;
  try {
    // Request an access token
    responseContent = Meteor.http.post(
      "https://login.uber.com/oauth/token", {
        auth: [config.clientId, config.secret].join(':'),
        params: {
          grant_type: 'authorization_code',
          code: query.code,
          redirect_uri: 'https://arrived-nhindman.c9users.io/api/uber'
        }
      }).content;
  } catch (err) {
    throw new Error("Failed to complete OAuth handshake with dropbox. " + err.message);
  }

  // If 'responseContent' does not parse as JSON, it is an error.
  if (!isJSON(responseContent)) {
    throw new Error("Failed to complete OAuth handshake with dropbox. " + responseContent);
  }

  // Success! Extract access token and expiration
  var parsedResponse = JSON.parse(responseContent);
  var accessToken = parsedResponse.access_token;
  var expiresIn = parsedResponse.expires_in;
  var refreshToken = parsedResponse.refresh_token;

  if (!accessToken) {
    throw new Error("Failed to complete OAuth handshake with dropbox " +
      "-- can't find access token in HTTP response. " + responseContent);
  }

  return {
    accessToken: accessToken,
    refreshToken: refreshToken,
    expiresIn: expiresIn
  };
};

//get information about Uber user that has been authorized with the application
var getIdentity = function (accessToken) {
  try {
    return Meteor.http.get("https://api.uber.com/v1/me", {
        headers: { Authorization: 'Bearer ' + accessToken }
    }).data;
  } catch (err) {
    throw new Error("Failed to fetch identity from dropbox. " + err.message);
  }
};

//create Mongo Collections
twilioRawIn = new Mongo.Collection('twilloRaw');
uberUsers = new Mongo.Collection('uberUsers');

//about the /api/uber route:
// GET:
// - receives authorization code from Uber 
// - exchanges for access tokens
// - updates user with access and refresh tokens if email in Uber account matches email in my app's user collection
// POST:
// - monitors ride status changes via a webhook
// - if ride status == 'accepted', use request id to match a request to a user in my app's user collection
// - using that user's access token, get ride requestInfo (e.g., driver, estimate) from Uber 
// - text requestInfo to user (and set confirmation_sent to true to prevent duplicate messages)
// - text user 1 minute later: Want to see places near your destination?
Router.route('/api/uber', { where: "server" } )
  .get( function() {
    var code = this.params.query.code;
    
    //create new user and save the tokens
    var response  = getTokenResponse(this.params.query);
    userMe = getIdentity(response.accessToken);
    userMe.accessToken = response.accessToken;
    userMe.expiresIn = response.expiresIn;
    userMe.refreshToken = response.refreshToken;
    userMe.createdAt = new Date();
    
    //find user in my app by email
    var user = uberUsers.findOne({email: userMe.email.toLowerCase()});
    
    //if user with the same email exists in my app, update user with tokens from Uber
    if (user) {
      uberUsers.update(user._id, _.extend(user, userMe));
      sendSms(user, 'You have connected your Uber account and may now request a ride. For example: "ride from SFO to 56 Manchester Street San Francisco".');
      this.response.end('Success!');
    } else {
      this.response.end('We could not find your email address in our database. Please text the email associated with your Uber account to login.');
      console.log('Received Uber Oauth token for unknown user ' + userMe.email);
    }
  })
  .post(function(){
    var webhookData = this.request.body;
    
    if (webhookData.event_type == 'requests.status_changed') {
      if (this.request.body.meta.status == 'accepted') {
        
        //use request id returned from webhook and match it to a user based on the request id saved in my app
        var user = uberUsers.findOne({'lastRequest.request_id':webhookData.meta.resource_id});
        var requestInfo = Meteor.http.get(webhookData.resource_href,{
          headers: { Authorization: 'Bearer ' + user.accessToken }
        }).data;
        
        //send ride confirmation with requestInfo to user
        if (!user.lastRequest.confirmation_sent) {
          sendSms(user, ''+requestInfo.driver.name+' is on the way and will arrive in '+requestInfo.eta+'. Look out for a '+requestInfo.vehicle.make+' with the license plate '+requestInfo.vehicle.license_plate+'!');
          Meteor.setTimeout(function(){
            sendSms(user, 'Text "/nearby food" or "/nearby coffee" to see places near your destination');
          },30000);
          uberUsers.update(user._id, {$set:{'lastRequest.confirmation_sent':true}});
        }
      }
    }
  });

Router.route('/api/twiml/sms', { where: "server" } )
  .post( function() {
    
    var rawIn = this.request.body;
    
    //see if the raw body is empty and if not insert into the db collection twilloRawIn
    if (Object.prototype.toString.call(rawIn) == "[object Object]") {
        twilioRawIn.insert(rawIn); 
    }

    var question = {};
    
    //parse the text to get the body of the sms
    if (rawIn.Body) {
        question.inputQuestion = rawIn.Body;
        question.source = "sms";
    } else if (rawIn.TranscriptionText) {
        question.inputQuestion = rawIn.TranscriptionText;
        question.source = "voicemail";
    } else {
        return;
    }
    question.inputName = rawIn.From;
    
    //get user's phone number
    var userPhone = rawIn.From;
    
    var user = uberUsers.findOne({phone:userPhone});
    console.log('found user is', user);
    
    //we have a user with a valid access token
    if(user && user.accessToken){
      //user is registered and logged in
      var match = question.inputQuestion.match(/ride from (.+) to (.+)/i);
      
      //handle texts
      if (match){
        var origin = match[1];
        var destination = match[2];
        handleRideRequest(origin, destination, user)
      }else if (question.inputQuestion.match(/confirm/i)) {
        handleRideConfirmation(user);
      }else if(question.inputQuestion.match(/nearby$/i)){
       sendSms(user,'Please include what you are looking for in your /nearby request. For example: "/nearby food".')
      }else if(match = question.inputQuestion.match(/nearby (.+)/i)){
        var goods = match[1];
        handleFoursquareRequest(user, goods);
      }else {
        sendSms(user, 'Please request a new ride or enter "confirm" to book a pending ride.');
      }
    }else{//user not found, ask to log in
    
      //check to see to see if a valid email sent by user and if so create new user in uberUsers collection
      if (question.inputQuestion.match(/^(([^<>()\[\]\.,;:\s@\"]+(\.[^<>()\[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i)) {
        handleUserLogin(userPhone, question);
      }else{
        sendSms({phone:userPhone}, 'Please enter the email associated with your Uber account.')
      }
    }
});

function sendSms(user, body) {
  twilio.sendSms({
      to:user.phone, // Any number Twilio can deliver to
      from: '+13305951544', // A number you bought from Twilio and can use for outbound communication
      body: body  // body of the SMS message
  }, function(err, responseData) { //this function is executed when a response is received from Twilio
    if (!err) { // "err" is an error received during the request, if any
      console.log(responseData.from); // outputs "+14506667788"
      console.log('sent sms',responseData.body); // outputs "word to your mother."
    } else {
      console.log("error sending sms", err);
    }
  });
}

function handleRideConfirmation(user) {
  //check if a request is open
  if (user.lastRequest && new Date() - user.lastRequest.time_requested < 2*60*1000 ) {
    delete user.lastRequest.time_requested;
    
    //get the request id used to match users after ride status is updated with accepted
    //in production, remove sandbox URL 'sandbox-api.uber'
    var requestInfo = Meteor.http.post("https://api.uber.com/v1/requests", {
        headers: { Authorization: 'Bearer ' + user.accessToken }, 
        data: user.lastRequest
    }).data;
    
    sendSms(user,'We have received your request and we are looking for drivers. You should hear back within 30 seconds.');
    
    //add user.lastRequest.request_id to user object
    uberUsers.update(user._id, {$set:{'lastRequest.request_id':requestInfo.request_id}});

  } else {
  sendSms(user, 'Sorry your ride request has expired, please make a new request. For example: "Ride from SFO to 56 Manchester Street San Francisco"');
  }
}

function handleUserLogin(userPhone, question){
  //insert new user object in the uberUsers collection w/ email and phone number
  uberUsers.insert({
    email: question.inputQuestion.toLowerCase(),
    phone: userPhone
  });
  
  //ask user to login via short link
  //https://login.uber.com/oauth/authorize?client_id=yaMBSmNdB5Cb-JbEP11G_9s9COUN17l_&response_type=code&scope=profile+request&redirect_uri=https://arrived-nhindman.c9users.io/api/uber
  sendSms(user, 'Please connect your Uber account with this link : https://goo.gl/jXO8KQ');
}

//TO DO: Breakup function
function handleRideRequest(origin, destination, user){
  var geo = new GeoCoder();
  var geocodedOrigin = geo.geocode(origin);
  var geocodedDestination = geo.geocode(destination);
  
  if (geocodedOrigin[0] && geocodedDestination[0]) {
    //get estimate of nearby drivers
    try {
      var priceEstimate = Meteor.http.get("https://api.uber.com/v1/estimates/price", {
        headers: { Authorization: 'Bearer ' + user.accessToken }, 
        params: {
          start_latitude: geocodedOrigin[0].latitude, 
          start_longitude: geocodedOrigin[0].longitude, 
          end_latitude: geocodedDestination[0].latitude,
          end_longitude: geocodedDestination[0].longitude 
        }
      }).data;
    }catch(error) {
      console.log(error, "error parsing address");
      sendSms(user, 'The address you entered is not recognized. Try entering the full address of your origin and destination.');
      return;
    }
    
    var timeEstimate = Meteor.http.get("https://api.uber.com/v1/estimates/time", {
      headers: { Authorization: 'Bearer ' + user.accessToken }, 
      params: {
        start_latitude: geocodedOrigin[0].latitude, 
        start_longitude: geocodedOrigin[0].longitude
      }
    }).data;
    
    var data = priceEstimate["prices"]; 
    
    // Sort Uber products by time to the user's location 
    data.sort(function(t0, t1) {
    return t0.duration - t1.duration;
    }); 

    //return object with shortest time
    var shortest = data[0];
    var shortestTimeObject = Array.prototype.slice.call(timeEstimate['times']).filter(function(estimate) {
      return estimate.product_id == shortest.product_id;
    })[0]; 
    
    //save last request in user object
    user.lastRequest = {
      start_latitude: geocodedOrigin[0].latitude, 
      start_longitude: geocodedOrigin[0].longitude, 
      end_latitude: geocodedDestination[0].latitude,
      end_longitude: geocodedDestination[0].longitude,
      product_id: shortest.product_id,
      time_requested: new Date()
    };
    uberUsers.update(user._id, user)
    
    sendSms(user, 'There is an Uber '+Math.ceil(shortest.duration / 60.0)+' minutes away and your ride will cost '+shortest.estimate+'. Please respond with "confirm" if you would like to book it.');
  }
  else {
    console.log("address not found");
    sendSms(user, 'We were unable to find those lcoations, please enter a different origin and destination. Try using the full address including the city name in your request.');
  }
}

function handleFoursquareRequest(user, goods) {
  var venues = Meteor.http.get('https://api.foursquare.com/v2/venues/search',{
    params: {
      ll:[user.lastRequest.end_latitude,user.lastRequest.end_longitude].join(','),
      query: goods,
      limit: 3,
      client_id:'YRXH0LHSXPSQQPQA34I41XKQCUNAVQIF0TTNXWXQC0NUZJGD',
      client_secret:'YOUR_FOURSQUARE_CLIENT_SECRET',
      v:'20140806',
      m:'foursquare'
    }
  }).data;

  var nearestVenues = venues.response.venues.map(function(venue,index){
    if (venue.url){
      return ''+(index + 1)+'. '+venue.name+'\n'+venue.url;
    } else {
      return ''+(index + 1)+'. '+venue.name+'\n'+venue.location.address;
    }
  }).join('\n');
  
  sendSms(user, ''+nearestVenues+'');
}
