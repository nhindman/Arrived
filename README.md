# Arrived

Arrived lets you request an Uber and find the best places near your destination via SMS.

See a demo of Arrived at https://arrived.splashthat.com

The bulk of the code referenced below can found be found in [twilio.js](https://github.com/nhindman/Arrived/blob/master/server/twillo.js).

Arrived is a Meteor application that uses the following APIs:
* [Uber] (#uber)
* [Twilio] (#twilio)
* [Foursquare] (#foursquare)

## <a name="uber"></a> Uber
In order to make ride requests on behalf of an Uber user, Arrived obtains an access token from the Uber API in three steps:

1. Authorize
2. Receive a redirect URI
3. Get an access_token

**1. Authorize**

Arrived prompts a user to login via a URL that directs the user to a web form where they can approve or deny the app access to their Uber account. Parameters to append to such a login URL can be found [here](https://developer.uber.com/docs/authentication#section-step-one-authorize). 

Here’s how the Arrived app’s login URL looks:

`https://login.uber.com/oauth/authorize?client_id=ARRIVED_CLIENT_ID&response_type=code&scope=profile+request&redirect_uri=https://arrived-nhindman.c9users.io/api/uber`

[Relevant code](https://github.com/nhindman/Arrived/blob/master/server/twillo.js#L235)

**2. Receive the redirect URI**

After a user completes the web form - thereby authorizing the Arrived app - Uber sends a single-use authorization code to the redirect URI and Arrived receives the authorization code:
```javascript
Router.route('/api/uber', { where: "server" } )
 .get( function() {
    var code = this.params.query.code;
 ...
```

[Relevant code](https://github.com/nhindman/Arrived/blob/master/server/twillo.js#L89)

**3. Get an access token**

Arrived then passes the authorization code received in step 2 into the function `getTokenResponse` which exchanges the authorization code for an access token:

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
[Relevant code](https://github.com/nhindman/Arrived/blob/master/server/twillo.js#L26)

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
