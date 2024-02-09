require('dotenv').config();
const { getCurrentGrades, retriveJustUsername, initProxies } = require('./GradeViewGetCurrentGrades/getCurrentGrades');
const express = require('express')
const NodeRSA = require('node-rsa');
const _ = require("lodash")
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

initProxies({
  newProxyOnFail: false,
  checkProxyInterval: 60,
  requestTimeout: 2*60,
})

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

let userDataList = [];
const users = [];
const userDataObj={}
let first = true;

setInterval(()=>{
  console.log("###################################################################################")
  console.log(`userDataList: ${userDataList.length}; users: ${users.length}; userDataObj: ${Object.keys(userDataObj).length}`)
  console.log(userDataList)
  const mem = process.memoryUsage()
  for(let memProp in mem)
    mem[memProp]=Math.ceil(mem[memProp]/1024/1024)+" MB"
  console.log(mem)
  console.log("###################################################################################")
},10*60*1000)

const userDataListener = db.collection('userData').onSnapshot(async snapshot => {
  console.log("GETTING LIST OF USERS")
  let timestampPromises = []
  snapshot.docChanges().forEach(change => {
    const doc = change.doc
    if (doc.exists) {
      let username = doc.id;
      let password = doc.data()["password"]?doc.data()["password"]:key.decrypt(doc.data()["passwordEncrypted"], 'utf8');
      let school = doc.data()["school"]
      if (change.type === 'added' || change.type === 'modified') {
        if (change.type === 'modified') {
          let index = users.findIndex(user=>user.username == username);
          if (index > -1) {
            users.splice(index, 1);
          }
        }
        if(doc.data()["password"]||doc.data()["passwordEncrypted"]){
          timestampPromises.push(
            db.collection('userTimestamps').doc(username).get().then(docTime => {
              if(docTime.exists && docTime.data()["Timestamp"] > new Date().getTime() - (1000*60*60*24*60)){
                users.push({username,password,school});
                // db.collection('users').doc(username).onSnapshot(docSnapshot => {
                //   userDataObj[username] = docSnapshot.data()
                // })
              }
            })
          )
        }
      }
      if (change.type === 'removed') {
        let index = users.findIndex(user=>user.username == username);
        if (index > -1) {
          users.splice(index, 1);
        }
      }
    }
  });
  await Promise.all(timestampPromises);
  if(first){
    first = false
    console.log(`CALLING RUN w/ ${users.length} found!`)
    run();
  }
})

var hrstart = process.hrtime()

// db.collection('userData').doc('10021258@sbstudents.org').get().then(async (doc)=>{
//   console.log("manual add")
//   let username = doc.id;
//   let password = doc.data()["password"]?doc.data()["password"]:key.decrypt(doc.data()["passwordEncrypted"], 'utf8');
//   let school = doc.data()["school"]
//   // for(var i = 0; i<50; i++)
//     users.push({username,password,school});
//   run();
// })

// New version: 20 works fine; 30 crash? 25: 1hr; 
const maxParalellChromes = 17; // 2 - 20 ; 3 - 20;4-30; 5 -crash
async function run(){
  console.log("init")
  updateTimeStamps();
  console.log(users.length)
  for(user of users){ 
    let i = 0
    while(userDataList.length >= maxParalellChromes){
      i++
      await Promise.race(userDataList)
      if(i>1){
        console.log(`${i}th iteration: ${userDataList}`)
        await new Promise((res)=>{setTimeout(()=>res("lol"),1000)})
      }
    }
    const usernameAsItAppearsInDatabase = user.username;
    const username = retriveJustUsername(usernameAsItAppearsInDatabase)
    const password = user.password;
    const school = user.school;
    const userRef = db.collection('users').doc(usernameAsItAppearsInDatabase);
    

    console.log("Starting scrape - "+username)
    let globalDataObj
    //if(username == "10015309@sbstudents.org"||username == "10015311@sbstudents.org"){//if(username == "10013096@sbstudents.org"||username == "10012734@sbstudents.org"){
    const dataObjPromise = getCurrentGrades(username,password,school).then(dataObj=>{
      const index = userDataList.indexOf(dataObjPromise);
      if (index > -1) {
        userDataList.splice(index, 1);
      }else{
        console.error("Failed to remove promise from userDataList")
      }
      globalDataObj = dataObj
      if(dataObj["Status"] == "Completed"){
        if(!userDataObj[usernameAsItAppearsInDatabase] || !_.isEqual(userDataObj[usernameAsItAppearsInDatabase],dataObj)){
          userDataObj[usernameAsItAppearsInDatabase] = dataObj
          userRef.set(dataObj);
          console.log("Updating Account - "+username)
        }else{
          console.log("No Changes Found - "+username)
        }
      }else{
        console.log("Not cached due to bad request - "+username+" - Status: " + dataObj["Status"])
      }
      return 'lel'
    }).catch(e=>{
      const index = userDataList.indexOf(dataObjPromise);
      if (index > -1) {
        userDataList.splice(index, 1);
      }else{
        console.error("Failed to remove promise from userDataList")
      }
      console.log(JSON.stringify(globalDataObj))
      console.log("Err caught when evaluating getCurrentGrades promise")
      console.log(e)
      console.log({username,password,school,dataObjPromise,usernameAsItAppearsInDatabase})
    })
    userDataList.push(dataObjPromise)
    //console.log(dataObj)    
    //}
  }
  // await Promise.all(userDataList)
  var hrend = process.hrtime(hrstart)
  console.info('New - Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000)
  console.log("Done!")
  hrstart = process.hrtime()
  run();
  // hrstart = process.hrtime()
  // runOld()
}

// async function runOld(){
//   console.log("init")
//   updateTimeStamps();
//   console.log(users.length)
//   for(user of users){ // New version: 20 works fine; 
//     if(userDataList.length > maxParalellChromes-1){
//       if(userDataList.length!=users.length)
//         listObj = userDataList[userDataList.length-maxParalellChromes]
//       else
//         listObj = userDataList[userDataList.length-1]

//       try{
//         var dataObj = await listObj["data"]

//         if(dataObj["Status"] == "Completed"){
//           if(!listObj.usernameAsItAppearsInDatabase || !_.isEqual(userDataObj[listObj.usernameAsItAppearsInDatabase],dataObj)){
//             userDataObj[listObj.usernameAsItAppearsInDatabase] = dataObj
//             listObj["userRef"].set(dataObj);
//             console.log("Updating Account - "+listObj["username"])
//           }else{
//             console.log("No Changes Found - "+listObj["username"])
//           }
//         }else{
//           console.log("Not cached due to bad request - "+listObj["username"]+" - Status: " + dataObj["Status"])
//         }
//       }catch(e){
//         console.log("Err caught when evaluating getCurrentGrades promise")
//         console.log(e)
//         console.log(listObj)
//       }

//       var index = userDataList.indexOf(listObj);
//       if (index > -1) {
//         userDataList.splice(index, 1);
//       }
//     }
//     var username = user.username;
//     var password = user.password;
//     var school = user.school;
//     var userRef = db.collection('users').doc(username);
//     username=retriveJustUsername(username)
//     console.log("Starting scrape - "+username)
//     //if(username == "10015309@sbstudents.org"||username == "10015311@sbstudents.org"){//if(username == "10013096@sbstudents.org"||username == "10012734@sbstudents.org"){
//         var dataObj = getCurrentGrades(username,password,school)
//         userDataList.push({data:dataObj,username,userRef,usernameAsItAppearsInDatabase:user.username})
//         //console.log(dataObj)
        
//     //}
//   }
//   await Promise.all(userDataList)
//   var hrend = process.hrtime(hrstart)
//   console.info('Old - Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000)
//   console.log("Done!")
// }

/* var cronJob = cron.job("15 6 * * *", function(){ //25 7,9,11,13,16 * * *
  run();
},null,false,"America/New_York"); 
cronJob.start();*/









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
