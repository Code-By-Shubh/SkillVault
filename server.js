import 'dotenv/config';
import express from 'express'
import bodyParser from 'body-parser';
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import db from './database.js';
import cookieParser from "cookie-parser";
const app = express();
const Port=process.env.PORT
const saltRounds=10;
import axios from 'axios';  
import { GoogleGenAI } from "@google/genai";


const API_KEY = process.env.API_KEY;
const MODEL = 'gemini-2.0-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?key=${API_KEY}`;
  

app.use(cookieParser());
app.use(bodyParser.urlencoded({extended:true}));
app.use(express.json());//to parse json object
app.use(express.static('public'));

import { dirname } from "path";
import { fileURLToPath } from "url";
const __dirname=dirname(fileURLToPath(import.meta.url));

app.get('/', (req, res) => {
  res.sendFile(__dirname+"/public/index.html");
})
app.get("/register",(req,res)=>{
  res.sendFile(__dirname+"/public/register.html");
})
app.get("/login",(req,res)=>{
  res.sendFile(__dirname+"/public/login.html");
})

app.get("/privacy",(req,res)=>{
  res.sendFile(__dirname+"/public/privacy.html");
})
app.get("/support",(req,res)=>{
  res.sendFile(__dirname+"/public/support.html");
})
app.get("/WhySkillVault",(req,res)=>{
  res.sendFile(__dirname+"/public/WhySkillVault.html");
})
app.get("/contact",(req,res)=>{
  res.sendFile(__dirname+"/public/contact.html");
})

app.post("/registered",async (req,res)=>{
  const {email,fullName,password,country}=req.body;
  try {
    const resultCheck=await db.query("SELECT * FROM users WHERE email=$1",[email,]);
    if(resultCheck.rows.length>0){
      res.json({error:"Email already exists. Try logging in."});
    }
    else{
      //hashing begins
      bcrypt.hash(password,saltRounds,async (err,hash)=>{
        if(err){
          console.log("error hashing password ",err);
          res.json({error:err})
        }
        else{
          await db.query("INSERT INTO users (name,email,password,country) VALUES ($1,$2,$3,$4)",
            [fullName,email,hash,country]);
          const result=await db.query("SELECT id FROM users WHERE email=$1",[email]);
          const {id}=result.rows[0];
          const token=jwt.sign({id,fullName,email},process.env.JWT_SECRET);
          res.cookie('token',token,{
            httpOnly:true,
            secure:true,
            sameSite:true,
            maxAge:60*60*1000
          })
          res.json({error:null})
        }
      });
    }
  } catch (error) {
    res.json({error:error});
  }
})



app.post("/loggined",async (req,res)=>{
  const {email,password}=req.body;
  try {
    const result=await db.query("SELECT * FROM users WHERE email=$1",[email]);
  if(result.rows.length>0){
    const user=result.rows[0];
    const storedPassword=user.password;
    const id=user.id;
    const fullName=user.name;
    
    bcrypt.compare(password,storedPassword,(err,result)=>{
      if(err){
        res.json({error:"Error comparig passwords"})
      }
      else{
        if(result){
          const token=jwt.sign({fullName,id,email},process.env.JWT_SECRET);
          res.cookie('token',token,{
            httpOnly:true,
            secure:true,
            sameSite:true,
            maxAge:60*60*1000
          })
        res.json({error:null});
        }
        else{
        res.json({error:"Incorrect Password! Try logging in again."})
        }
      }
      
    })
  }
  else{
    res.json({error:"User not found"});
  }
  } catch (error) {
    res.json({error:error});
  }
  
})

app.get("/forget",(req,res)=>{
  res.render("forgot-password.ejs");
});

app.post("/forgot-password", async (req, res) => {
  const { email, new_password } = req.body;
  try {
    // Check if user exists
    const userRes = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    console.log(email);
    if (userRes.rows.length === 0) {
      return res.send("No user with that email exists.");
    }
    const user=userRes.rows[0];
    // Hash the new password
    const hashedPassword = await bcrypt.hash(new_password, 10);

    // Update the password in database
    await db.query("UPDATE users SET password = $1 WHERE email = $2", [hashedPassword, email]);

    const token=jwt.sign({fullName:user.name,id:user.id,email:user.email},process.env.JWT_SECRET);
          res.cookie('token',token,{
            httpOnly:true,
            secure:true,
            sameSite:true,
            maxAge:60*60*1000
          })
    res.redirect("/dashboard");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error occurred.");
  }
});



app.get("/logout",(req,res)=>{
  res.clearCookie('token');
  res.redirect("login");
})
function verifyJWT(req,res,next){
  const token=req.cookies.token;
  try {
    const userPayload=jwt.verify(token,process.env.JWT_SECRET);
    req.user=userPayload;
    next();
  } catch (error) {
    res.status(403).json({ message: 'Invalid or expired token' });
  }
}


app.use(verifyJWT);



app.get("/dashboard",async (req,res)=>{
  const name=req.user.fullName;
  const id=req.user.id;
  let trackedSkills=0;
  let doneSkills=0;
  const progress=100;
  let pendingSkills;
  let total_Minutes=0;
  let total_Hours=0;
  try {
    const response1=await db.query("SELECT COUNT(*) FROM skills WHERE user_id=$1",[id]);
    trackedSkills=response1.rows[0].count;
    const response2=await db.query("SELECT COUNT(*) FROM skills WHERE user_id=$1 AND progress=$2",[id,progress]);
    doneSkills=response2.rows[0].count;
    const response3=await db.query("SELECT name FROM skills WHERE user_id=$1 AND progress!=$2",[id,progress]);
    pendingSkills=response3.rows;
    const response4 = await db.query("SELECT SUM(minute) AS total_minutes FROM skills WHERE user_id=$1",[id]);
    total_Minutes = (response4.rows[0].total_minutes)%60;
    const response5 = await db.query("SELECT SUM(time) AS total_hours FROM skills WHERE user_id=$1",[id]);
    total_Hours =Math.floor(Number(response5.rows[0].total_hours)+Number((response4.rows[0].total_minutes)/60)) ;
    
  } catch (error) {
    console.log("error occured ",error);
  }
  res.render("dashboard.ejs",{name,trackedSkills,doneSkills,pendingSkills,total_Minutes,total_Hours});
})


app.get("/new",(req,res)=>{  //done
  res.render("new.ejs");
})

app.post("/newSkill",async (req,res)=>{  //done
  const {skillName,description,category,goal,progress}=req.body;
  const createdTime=new Date().getTime();
  try {
    let completedTime=null;
    let hours=0;
    let minutes=0;
    if(parseInt(progress)>100){
      
      return res.json({error:"Enter progress within scale of 100"})
    }
    if(parseInt(progress)===100)
      {
      completedTime=new Date().getTime();
    }
    const id=req.user.id;
    await db.query("INSERT INTO skills (user_id,name,description,progress,category,goal,created_at,completed_at,time,minute) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [id,skillName,description,parseInt(progress),category,goal,createdTime,completedTime,parseInt(hours),parseInt(minutes)]
    )
    res.json({error:null});
  } catch (error) {
    res.json({error:error});
  }
})

app.get("/update/:id",async (req,res)=>{
  const id=req.params.id;
  try {
    const response=await db.query("SELECT * FROM skills WHERE id=$1",[id]);
    res.render("update.ejs",{skill:response.rows[0]});
  } catch (error) {
      console.log("error during api call");
  }
});

app.patch("/updateSkill/:id",async (req,res)=>{
  const {skillName,description,category,goal,progress}=req.body;
  const id=req.params.id;
  let completedTime=null;
  let hours=0;
  let minutes=0;
  let totalMinutes=0;
  try {
    if(parseInt(progress)>100){
      
      return res.json({error:"Enter progress in scale of 100"})
    }
    if(parseInt(progress)===100)
      {
      completedTime=new Date().getTime();
      const response=await db.query("SELECT created_at FROM skills WHERE id=$1",[id]);
      const createdTime1=response.rows[0].created_at;
      totalMinutes=(completedTime-createdTime1)*0.001/60;//time in minutes
      hours=(completedTime-createdTime1)*0.001/60/60;
      minutes= totalMinutes % 60;
    }
    await db.query("UPDATE skills SET name=$1,description=$2,progress=$3,category=$4,goal=$5,completed_at=$6,time=$7,minute=$8 WHERE id=$9",
      [skillName,description,parseInt(progress),category,goal,completedTime,parseInt(hours),parseInt(minutes),id]
    )
    res.json({error:null});
  } catch (error) {
    res.json({error:error});
  }
})
app.get("/skills",async(req,res)=>{ //done
  try {
    const id=req.user.id;
    const response=await db.query("SELECT * FROM skills WHERE user_id=$1",[id]);
    res.render("skills.ejs",{skills:response.rows});
  } catch (error) {
    res.redirect("/dashboard",{error:"Error fetching skills"});
  }
})
app.delete("/delete/:id",async (req,res)=>{  //done
  const id=req.params.id;
  try{
    const result=await db.query("DELETE FROM skills WHERE id=$1",[id]);
    if (result.rowCount === 0) {
    res.json({ error: "No skill found with that ID" });
    } else {
    res.json({ error: null});
  }
  }catch(error){
    res.json({error:"Error in deleting"});
  }
})
app.post("/chat",async (req,res)=>{
  const id=req.user.id;
  const {mess}=req.body;
  const ai = new GoogleGenAI({ apiKey: API_KEY});

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: `TOP 3 ${mess} LEARING TOPICS (EXACTLY 3 WORDS NOTHING ELSE IN YOUR RESPONSE IN SEQUENTIAL (1,2,3) ORDER)`,
  });
  console.log(response.text);
  try {
    const result = await db.query("UPDATE skills SET topics = $1 WHERE name= $2",[response.text,mess]);
  
    res.json({error:null})
  } catch (error) {
    res.json({error:"Error updating data"});
  }
  
})

app.post('/gemini', async (req, res) => {
  const userInput = req.body.prompt;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: userInput }],
      },
    ],
    generationConfig: {
      responseMimeType: 'text/plain',
    },
    tools: [{ googleSearch: {} }],
  };

  try {
    const response = await axios.post(API_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    let output = '';

    // Loop through the streaming response chunks
    for (const chunk of response.data) {
      output += chunk.candidates[0].content.parts[0].text;
    }

    res.json({ reply: output });
  } catch (err) {
    console.error('Gemini API Error:', err.message);
    res.status(500).json({ error: 'Failed to call Gemini API' });
  }
});

app.get('/ai', (req, res) => {
  res.sendFile((__dirname+'/public/ai.html'));
});

app.listen(Port,()=>{
  console.log(`Server running on port: ${Port}`)
}
);
