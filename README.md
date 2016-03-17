# Arrived

Arrived lets you request an Uber and find the best places near your destination via SMS.

See a demo of Arrived at https://arrived.splashthat.com

Arrived is a Meteor application that utilizes the following APIs:
* [Uber] (#uber)
* [Twilio] (#twilio)
* [Foursquare] (#foursquare)

## <a name="uber"></a> Uber
In order to make ride requests on behalf of an Uber user, Arrived obtains an access_token from Uber in three steps:

1. [Authorize](https://github.com/nhindman/Arrived/blob/master/server/twillo.js#L235)
2. [Receive a redirect URI](https://github.com/nhindman/Arrived/blob/master/server/twillo.js#L89)
3. [Get an access_token](https://github.com/nhindman/Arrived/blob/master/server/twillo.js#L26)

Below is how the Arrived app follows each of the three OAuth steps above:

**1. Authorize**

When Arrived receives a text message from a user, it checks the Arrived app’s user database to see if a user with the same phone number has a valid access token, which would authorize Arrived to make ride requests on that user’s behalf.

If Arrived does not find a valid access token, it prompts the user to enter the email associated with their Uber account (which Arrived saves to its user database for later use). Arrived then asks the user to login via a URL that directs the user to an HTML web form where a user can approve or deny access to their Uber account. A full list of query parameters to append to the login URL can be found [here](https://developer.uber.com/docs/authentication#section-step-one-authorize). 

Here’s how the Arrived app’s login URL looks before it is short-linked:
`https://login.uber.com/oauth/authorize?client_id=ARRIVED_CLIENT_ID&response_type=code&scope=profile+request&redirect_uri=https://arrived-nhindman.c9users.io/api/uber`

**2. Receive the redirect URI**

After a user completes the web form - thereby authorizing Arrived - Uber sends a single-use authorization to the redirect URI and Arrived receives the authorization code:
```javascript
Router.route('/api/uber', { where: "server" } )
 .get( function() {
    var code = this.params.query.code;
 ...
```

**3. Get an access token**

Arrived then passes the authorization code received in step 2 into the function `getTokenResponse` which exchanges the authorization code for an access token (full sample response [here](https://developer.uber.com/docs/authentication#section-step-three-get-an-access-token)):

```javascript
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
...  
```

Now that Arrived has an **access token**, the app can:
* [Return user information about the authorized Uber user](https://github.com/nhindman/Arrived/blob/master/server/twillo.js#L63)
* [Make Ride Requests on behalf of an Uber user](https://github.com/nhindman/Arrived/blob/master/server/twillo.js#L220)

In addition, Arrived tracks the status of a ride request in order to deliver timely texts to users. To do so, Arrived [specifies a webhook URL](https://github.com/nhindman/Arrived/blob/master/server/twillo.js#L113) that receives POST requests from Uber about changes in the status of a ride:

```javascript
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
```

## <a name="uber"></a> Twilio
TO DO 
## <a name="uber"></a> Foursquare
TO DO
