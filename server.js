const puppeteer = require('puppeteer');
const $ = require('cheerio');
const url = 'https://students.sbschools.org/genesis/parents?gohome=true';
const express = require('express')

const admin = require('firebase-admin');

var serviceAccount = require('./secureContent/serviceKey.json');

const app = express()
const port = process.env.PORT || 3000

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  app.get('/', async (req, res) => {
    console.log("RUNINNG")
    res.json({HEY:"HEY"})
  })

  app.listen(port, () => console.log(`Example app listening on port ${port}!`))
  
  var db = admin.firestore();
console.log("init")
db.collection('userData').get()
.then(async snapshot => {
    let users = [];
  snapshot.forEach(doc => {
      console.log(doc.id)
      if (doc.exists) {
        if(doc.data()["password"]){
          var username = doc.id;
          var password = doc.data()["password"];
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
        if(username == "10013096@sbstudents.org"){
            var dataObj = await getData(username,password)
            console.log(dataObj)
            if(dataObj["Status"] == "Completed"){
                console.log("Updating Account")
                userRef.set(dataObj);
            }else{
                console.log("Not cached due to bad request")
            }
        }
    }
  });



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
  
    const classes = await page.evaluate( () => (Array.from( (document.getElementById("fldCourse")).childNodes, element => element.value ) ));
  
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
          
        if(!grades[ClassName][defaultMP])
          grades[ClassName][defaultMP] = {}
        grades[ClassName][defaultMP]["Assignments"] = await scrapeMP(page);
        grades[ClassName][defaultMP]["avg"] = await page.evaluate(()=>document.getElementsByTagName("b")[0].innerText.replace(/\s+/g, '').replace(/[^\d.%]/g,''))
        //console.log(ClassName)
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
              
              //console.log("MP switch")
              
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
    grades["Status"] = "Completed";
    await browser.close();
    return grades;
}