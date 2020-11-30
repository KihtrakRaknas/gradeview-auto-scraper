require('dotenv').config();
const { getCurrentGrades, retriveJustUsername } = require('./GradeViewGetCurrentGrades/getCurrentGrades');
const express = require('express')
const NodeRSA = require('node-rsa');
//const keysObj = require('./secureContent/keys')
const fs = require('fs');
const key = new NodeRSA({b: 512});
key.importKey(process.env.PUBLIC_KEY/*keysObj.public*/, 'pkcs1-public-pem');
key.importKey(process.env.PRIVATE_KEY/*keysObj.private*/, 'pkcs1-private-pem');

const admin = require('firebase-admin');

var serviceAccount = JSON.parse(process.env.SERVICE_KEY)//require('./secureContent/serviceKey.json');

const app = express()
const port = process.env.PORT || 3000

var cron = require('cron');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  app.get('/', async (req, res) => {
    console.log("RUNINNG")
    res.json({HEY:"HEY"})
  })

  app.listen(port, () => console.log(`Example app listening on port ${port}!`))
  var db = admin.firestore();

function updateTimeStamps(){
  db.collection('errors').doc("Auto-Scraper").get().then(doc => {
    db.collection('errors').doc("Auto-Scraper").update({
      secondLastCompletion: doc.data()["lastCompletion"],
      lastCompletion: new Date().getTime()
    })
    
  })
}

db.collection('errors').doc("Auto-Scraper").get().then(doc => {
  db.collection('errors').doc("Auto-Scraper").update({
    secondLastRestart: doc.data()["lastRestart"],
    lastRestart: new Date().getTime()
  })
})

userDataList = [];

function run(){
  console.log("init")
  updateTimeStamps();
  db.collection('userData').get()
  .then(async snapshot => {
      let users = [];
      console.log("GETTING LIST OF USERS")
      var timestampPromises = [];
      snapshot.forEach(doc => {
        //console.log(doc.id)
        if (doc.exists) {
          if(doc.data()["password"]||doc.data()["passwordEncrypted"]){
            var username = doc.id;
            timestampPromises.push(
              db.collection('userTimestamps').doc(username).get().then(docTime => {
                if(docTime.exists && docTime.data()["Timestamp"] > new Date().getTime() - (1000*60*60*24*60)){
                  var password = doc.data()["password"]?doc.data()["password"]:key.decrypt(doc.data()["passwordEncrypted"], 'utf8');
                  //password? password : decode (encrpted)
                  var school = doc.data()["school"]
                  users.push({username,password,school});
                }
              })
            )
          }
        }
      })
      await Promise.all(timestampPromises);
      /*let finalUsers = []
      for(user of users)
        if(user.username == "10013096@sbstudents.org"||user.username == "10012734@sbstudents.org"||user.username == "10013095@sbstudents.org"||user.username == "10013090@sbstudents.org")
          finalUsers.push(user);
      users = finalUsers;*/
      return users;
    }).then(async (users)=>{
      console.log(users.length)
      for(user of users){
        const maxParalellChromes = 5; // 2 - 20 ; 3 - 20;4-30; 5 -crash
        if(userDataList.length > maxParalellChromes-1){
          if(userDataList.length!=users.length)
            listObj = userDataList[userDataList.length-maxParalellChromes]
          else
            listObj = userDataList[userDataList.length-1]

          var dataObj = await listObj["data"]

          //TODO: LOOP THROUGH ARRAY (userDataList) AND DELETE the objects to save memory

          if(dataObj["Status"] == "Completed"){
            console.log("Updating Account - "+listObj["username"])
            try{
              listObj["userRef"].set(dataObj);
            }catch(e){
              console.log(e)
              console.log(listObj)
            }
          }else{
            console.log("Not cached due to bad request - "+listObj["username"])
          }

          var index = userDataList.indexOf(listObj);
          if (index > -1) {
            userDataList.splice(index, 1);
          }
        }
          var username = user.username;
          var password = user.password;
          var school = user.school;
          var userRef = db.collection('users').doc(username);
          username=retriveJustUsername(username)
          console.log("Starting scrape - "+username)
          //if(username == "10015309@sbstudents.org"||username == "10015311@sbstudents.org"){//if(username == "10013096@sbstudents.org"||username == "10012734@sbstudents.org"){
              var dataObj = getCurrentGrades(username,password,school)
              userDataList.push({data:dataObj,username,userRef})
              //console.log(dataObj)
              
          //}
      }
    }).then(async ()=>{
      console.log("Done!")
      run();
    });
  }

/* var cronJob = cron.job("15 6 * * *", function(){ //25 7,9,11,13,16 * * *
  run();
},null,false,"America/New_York"); 
cronJob.start();*/
if(new Date().getTime() > 1606710523628)
  run();








// The following are one time use function. They are only here for convenience. 
const fetch = require("node-fetch");
//BACK UP USERS
/*db.collection('userData').get()
.then(async snapshot => {
  return fetch('https://raw.githubusercontent.com/KihtrakRaknas/DirectoryScraper/master/outputObj.json', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        },
      })
      .then((response) => {
        return response.json();
      })
      .then((responseJson) => {
        let users = [];
        snapshot.forEach(doc => {
            console.log(doc.id)
            if (doc.exists) {
              if(doc.data()["password"]||doc.data()["passwordEncrypted"]  ){
                var email = doc.id;
                var password = doc.data()["passwordEncrypted"]//doc.data()["password"]?doc.data()["password"]:key.decrypt(doc.data()["passwordEncrypted"], 'utf8');
                var name = responseJson[doc.id];
                users.push({email,password,name});
              }
            }
          })
          return users;
      })
  }).then((users)=>{
    var backUpRef = db.collection('userEmails').doc("backup");
    backUpRef.update({backup: users});
    //fs.writeFileSync("backup.json",JSON.stringify(users))
  });*/

  //DELETE USERS ):
  /*db.collection('userData').get()
  .then(async snapshot => {
        snapshot.forEach(doc => {
            console.log(doc.id)
            if(doc.id!="10013074@sbstudents.org"&&doc.id!="10015503@sbstudents.org"){
              db.collection('userData').doc(doc.id).delete().then(function() {
                  console.log("Document successfully deleted :(");
              }).catch(function(error) {
                  console.error("Error removing document: ", error);
              });
            }
      })
  });*/

  //DELETE ALL TOKENS ):
  /*db.collection('tokenReverseIndex').get()
  .then(async snapshot => {
          snapshot.forEach(doc => {
              console.log(doc.id)
                db.collection('tokenReverseIndex').doc(doc.id).delete().then(function() {
                  console.log("Document successfully deleted!");
              }).catch(function(error) {
                  console.error("Error removing document: ", error);
              });
              
        })
    });*/

  //DELETE PASSWORD OR ADD ENCRIPTED PASSWORDS
  /*let FieldValue = require('firebase-admin').firestore.FieldValue;
  db.collection('userData').get()
.then(async snapshot => {
  snapshot.forEach(doc => {
      console.log(doc.id)
      if (doc.exists) {
        if(doc.data()["password"]){
          var username = doc.id;
          var password = doc.data()["password"];
          var encrptedPass = key.encrypt(password, 'base64')
          var userRef = db.collection('userData').doc(username);
          userRef.update({
            password: FieldValue.delete()            //encrptedPass
          })
        }
      }
    })
  })*/