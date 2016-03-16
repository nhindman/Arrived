Meteor.startup(function() {
  
Accounts.ui.config({'requestPermissions':{'facebook':['email','user_friends']}});




  
//   Meteor.loginWithFacebook({
//     requestPermissions: ['user_friends']
//   }, function (err) {
//     if (err) {
//       Session.set('errorMessage', err.reason || 'Unknown error');
//     }
//   });
  
  Meteor.loginWithUber({
    requestPermissions: ['request','profile']
  }, function (err) {
    if (err) {
      Session.set('errorMessage', err.reason || 'Unknown error');
    }
  });
//   uber client id: yaMBSmNdB5Cb-JbEP11G_9s9COUN17l_
// Nate Hindman

// uber secret: 
// cBJfQlftbMlnIzTHmcXYb77djNe80BAIrmgZPcWK
// Nate Hindman

// uber server token: 7rFb7suI8UGbHBTyNQ-uAKfy9nj1CcHgdSZNRCtA
  
});


// // Twilio Credentials 
// var accountSid = 'ACa8fc4b74413101a43cbf299592fde2fc'; 
// var authToken = '54efef5c82677715f09a509f17394429'; 

// //require the Twilio module and create a REST client 
// var client = require('twilio')(accountSid, authToken); 

// client.messages.create({ 
// from: "+13305951544", 
// }, function(err, message) { 
// console.log(message.sid); 
// });