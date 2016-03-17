# Arrived

Arrived lets you request an Uber and find the best places near your destination via SMS.

See a demo of Arrived at https://arrived.splashthat.com

Arrived is a Meteor application that utilizes the following APIs:
* [Uber] (#uber)
* [Twilio] (#twilio)
* [Foursquare] (#foursquare)

## <a name="uber"></a> Uber
In order to access resources on behalf of an Uber user via the [Me](https://developer.uber.com/docs/v1-me) and [Requests](https://developer.uber.com/docs/v1-requests) endpoints, Arrived obtains an access_token from Uber in three steps:

1. [Authorize](https://github.com/nhindman/Arrived/blob/master/server/twillo.js#L235)
2. [Receive a redirect URI](https://github.com/nhindman/Arrived/blob/master/server/twillo.js#L89)
3. [Get an access_token](https://github.com/nhindman/Arrived/blob/master/server/twillo.js#L26)

Using the access_token, Arrived is then authorized to:

* [Return user information about the authorized Uber user](https://github.com/nhindman/Arrived/blob/master/server/twillo.js#L63)
* [Make Ride Requests on behalf of an Uber user](https://github.com/nhindman/Arrived/blob/master/server/twillo.js#L220)

To track the status of a ride request and deliver timely texts to users, Arrived [specifies a webhook URL](https://github.com/nhindman/Arrived/blob/master/server/twillo.js#L113) that receives POST requests from Uber about changes in the state of resources:

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
