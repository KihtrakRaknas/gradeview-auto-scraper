const puppeteer = require('puppeteer');
const $ = require('cheerio');
const url = 'https://students.sbschools.org/genesis/parents?gohome=true';
const express = require('express')
const NodeRSA = require('node-rsa');
const key = new NodeRSA({b: 512});
const keysObj = require('./secureContent/keys')
const fs = require('fs');

key.importKey(keysObj.public, 'pkcs1-public-pem');
key.importKey(keysObj.private, 'pkcs1-private-pem');

const admin = require('firebase-admin');

var serviceAccount = require('./secureContent/serviceKey.json');

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

function run(){
  console.log("init")
  db.collection('userData').get()
  .then(async snapshot => {
      let users = [];
    snapshot.forEach(doc => {
        console.log(doc.id)
        if (doc.exists) {
          if(doc.data()["password"]||doc.data()["passwordEncrypted"]){
            var username = doc.id;
            var password = doc.data()["password"]?doc.data()["password"]:key.decrypt(doc.data()["passwordEncrypted"], 'utf8');
            //password? password : decode (encrpted)
            users.push({username,password});
          }
        }
      })
        return users;
    }).then(async (users)=>{
      for(user of users){
          var username = user.username;
          var password = user.password;
          var userRef = db.collection('users').doc(username);
          console.log(username)
          //if(username == "10013096@sbstudents.org"||username == "10012734@sbstudents.org"){
              var dataObj = await getData(username,password)
              console.log(dataObj)
              if(dataObj["Status"] == "Completed"){
                  console.log("Updating Account")
                  userRef.set(dataObj);
              }else{
                  console.log("Not cached due to bad request")
              }
          //}
      }
    });
  }



async function scrapeMP(page){
    var list = await page.evaluate(() => {
      var assignments = [];
      for(var node of document.getElementsByClassName("list")[0].childNodes[1].childNodes){
  
        if(node.classList && !node.classList.contains("listheading")&&node.childNodes.length>=11){
          var assignData={};
  
          //console.log(node.childNodes);
          //console.log(node.childNodes[3].innerText);
            assignData["Date"] = node.childNodes[3].innerText;
          //console.log(node.childNodes[7].innerText);
          assignData["Category"] = node.childNodes[7].innerText
          //console.log(node.childNodes[9].innerText);
          assignData["Name"] = node.childNodes[9].innerText;
          //console.log(node.childNodes[11].childNodes[0].textContent.replace(/\s/g,''));
          assignData["Grade"] = node.childNodes[11].childNodes[0].textContent.replace(/\s/g,'')
          assignments.push(assignData);
          }
      }
      return assignments;
    });
    return list;
  }

  async function getData(email, pass) {
      var grades = {};
    
        var email = encodeURIComponent(email);
        pass = encodeURIComponent(pass);
      var url2 = 'https://students.sbschools.org/genesis/j_security_check?j_username='+email+'&j_password='+pass;
    
        const browser = await puppeteer.launch({
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1920x1080',
          ],
          
            //headless: false, // launch headful mode
            //slowMo: 1000, // slow down puppeteer script so that it's easier to follow visually
          
          });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3738.0 Safari/537.36');
    
        await page.setRequestInterception(true);
        const blockedResourceTypes = [
          'image',
          'media',
          'font',
          'texttrack',
          'object',
          'beacon',
          'csp_report',
          'imageset',
          'stylesheet',
        ];
    
        const skippedResources = [
          'quantserve',
          'adzerk',
          'doubleclick',
          'adition',
          'exelator',
          'sharethrough',
          'cdn.api.twitter',
          'google-analytics',
          'googletagmanager',
          'google',
          'fontawesome',
          'facebook',
          'analytics',
          'optimizely',
          'clicktale',
          'mixpanel',
          'zedo',
          'clicksor',
          'tiqcdn',
        ];
        page.on('request', (req) => {
          const requestUrl = req._url.split('?')[0].split('#')[0];
          if (
            blockedResourceTypes.indexOf(req.resourceType()) !== -1 ||
            skippedResources.some(resource => requestUrl.indexOf(resource) !== -1)
          ) {
            req.abort();
          } else {
            req.continue();
        }
        });
    
        await page.goto(url, {waitUntil: 'domcontentloaded'});
        await page.goto(url2, {waitUntil: 'domcontentloaded'});
    
        var signedIn = false;
        if(await $('.sectionTitle', await page.content()).text().trim() != "Invalid user name or password.  Please try again.")
          signedIn = true;
        if(!signedIn){
          await browser.close();
          console.log("BAD user||pass")
          return {Status:"Invalid"};
        }
    
        const url3 = "https://students.sbschools.org/genesis/parents?tab1=studentdata&tab2=gradebook&tab3=coursesummary&action=form&studentid="+email.split("%40")[0];
        await page.goto(url3, {waitUntil: 'domcontentloaded'});
        
    
        //await page.evaluate(text => [...document.querySelectorAll('*')].find(e => e.textContent.trim() === text).click(), "Gradebook");
        //await page.waitForNavigation({ waitUntil: 'domcontentloaded' })
      //await page.evaluate(text => [...document.querySelectorAll('*')].find(e => e.textContent.trim() === text).click(), "Course Summary");
      //await page.waitForNavigation({ waitUntil: 'domcontentloaded' })
      let classes;
        try{
          classes = await page.evaluate( () => (Array.from( (document.getElementById("fldCourse")).childNodes, element => element.value ) ));
        }catch(err){
          await browser.close();
          console.log("No AUP??? - No Courses Found")
          return {Status:"No Courses Found"};
        }
        
    
      for(var indivClass of classes){
        if(indivClass){
          //indivClass
          await page.evaluate((classID) => changeCourse(classID),indivClass);
          await page.waitForNavigation({ waitUntil: 'domcontentloaded' })
          const markingPeriods = await page.evaluate( () => (Array.from( (document.getElementById("fldSwitchMP")).childNodes, element => element.value ) ));
          const defaultMP = await page.evaluate(()=>document.getElementById("fldSwitchMP").value);
          markingPeriods.splice(markingPeriods.indexOf(defaultMP), 1);
    
          const ClassName = await page.evaluate((classID)=>document.querySelectorAll('[value="'+classID+'"]')[0].innerText,indivClass);
          if(!grades[ClassName])
            grades[ClassName] = {}
            
              grades[ClassName]["teacher"] = await page.evaluate(()=>{
                  let list = document.getElementsByClassName("list")[0].childNodes[1].childNodes[4].childNodes[5];
                  if(list)
                      return list.innerText
                    else
                      return null;
              });
          if(await page.evaluate(()=>{return document.getElementsByClassName("list")[0].getElementsByTagName("span")[0].innerText.match(new RegExp('1?[0-9]/[1-3]?[0-9]/[0-9][0-9]'))?new Date()-new Date(document.getElementsByClassName("list")[0].getElementsByTagName("span")[0].innerText.match(new RegExp('[0-1]?[0-9]/[0-3]?[0-9]/[0-9][0-9]'))).getTime()>0:false})){
            if(!grades[ClassName][defaultMP])
              grades[ClassName][defaultMP] = {}
            grades[ClassName][defaultMP]["Assignments"] = await scrapeMP(page);
            grades[ClassName][defaultMP]["avg"] = await page.evaluate(()=>document.getElementsByTagName("b")[0].innerText.replace(/\s+/g, '').replace(/[^\d.%]/g,''))
            //console.log(ClassName)
          }
          for(var indivMarkingPeriod of markingPeriods){
            if(indivMarkingPeriod){
                
              if(!grades[ClassName]["teacher"]){
                  grades[ClassName]["teacher"] = await page.evaluate(()=>{
                  let list = document.getElementsByClassName("list")[0].childNodes[1].childNodes[4].childNodes[5];
                  if(list)
                  return list.innerText
                  else
                    return null;
                });
              }
                
                await page.evaluate((indivMP) => {
                    
                  document.getElementById("fldSwitchMP").value = indivMP;
                  displayMPs();
                  document.getElementsByTagName("BUTTON")[1].click()//"Switch Marking Period btn"
                },indivMarkingPeriod);
                await page.waitForNavigation({ waitUntil: 'domcontentloaded' })
                
                //console.log(page.evaluate(()=>{return document.getElementsByClassName("list")[0].getElementsByTagName("span")[0].innerText.match(new RegExp('[0-1]?[0-9]/[0-3]?[0-9]/[0-9][0-9]'))?new Date()-new Date(document.getElementsByClassName("list")[0].getElementsByTagName("span")[0].innerText.match(new RegExp('[0-1]?[0-9]/[0-3]?[0-9]/[0-9][0-9]'))).getTime()>0:false}))
                if(await page.evaluate(()=>{return document.getElementsByClassName("list")[0].getElementsByTagName("span")[0].innerText.match(new RegExp('[0-1]?[0-9]/[0-3]?[0-9]/[0-9][0-9]'))?new Date()-new Date(document.getElementsByClassName("list")[0].getElementsByTagName("span")[0].innerText.match(new RegExp('[0-1]?[0-9]/[0-3]?[0-9]/[0-9][0-9]'))).getTime()>0:false})){
                  if(!grades[ClassName][indivMarkingPeriod])
                    grades[ClassName][indivMarkingPeriod] = {}
                  //console.log("Scraping page")
                  grades[ClassName][indivMarkingPeriod]["Assignments"] = await scrapeMP(page);
                    //console.log("Getting avg")
                  grades[ClassName][indivMarkingPeriod]["avg"] = await page.evaluate(()=>document.getElementsByTagName("b")[0].innerText.replace(/\s+/g, '').replace(/[^\d.%]/g,''))
                    //console.log("Done")
                }
            }
          }
        }
      }
      grades["Status"] = "Completed";
      await browser.close();
      return grades;
  }

var cronJob = cron.job("25 7,16 * * *", function(){
  run();
}); 

cronJob.start();
run();

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