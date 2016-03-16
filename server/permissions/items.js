Items.allow({
  'insert': function(userId, doc) {
    return userId;
  },
  'update': function(userId, doc, fields, modifier) {
    return userId;
  },
  'remove': function(userId, doc) {
    return userId;
  }
});

Items.allow({
  'insert': function(userId, doc) {
    return userId;
  },
  'update': function(userId, doc, fields, modifier) {
    return userId;
  },
  'remove': function(userId, doc) {
    return userId;
  }
});

//server side
Meteor.startup(function () {
  
  Accounts.loginServiceConfiguration.remove({
    service: "uber"
  });
  Accounts.loginServiceConfiguration.insert({//uber api keys ok read to rolls :D
    service: "uber",
    clientId: 'yaMBSmNdB5Cb-JbEP11G_9s9COUN17l_',
    secret: 'YOUR_UBER_SERVER_TOKEN'
  });
  
  
});