require('dotenv').config();
const express = require("express");

const http= require("http");
const mongoose = require("mongoose");
const app = express();
const server = http.createServer(app);

const path = require('path');
const crypto = require("crypto");
const bodyparser= require("body-parser");
const cookieParser = require("cookie-parser");
const hbs= require("hbs");
const auth = require("./middleware/auth");
const limitter = require('express-rate-limit');
const { check, validationResult } = require('express-validator');

const encryptdecrypt = require("./public/js/Encrypt.js");

const socketio = require('socket.io');
const io = socketio(server);

// Running Server at port number

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log('server is running at port no '+port)
});


//Connection establishment with Database

mongoose.connect(process.env.DATABASE, {
}).then(() => {
    console.log('Connection successful');
}).catch((e) => {
    console.log('no connection'+e);
})


/////// Socket handling
var usp = io.of('/user-namespace');

usp.on('connection', async function(socket){
    var userId= socket.handshake.auth.token;
    const UserData =await Users.findOne({_id:userId});
    console.log("User Connected: "+ UserData.fullName);

    await Users.findByIdAndUpdate({_id : userId}, { $set:{ isOnline:'1'}});

    //User Online Status Broadcast
    socket.broadcast.emit('getOnlineUser', { user_id : userId});

    socket.on('disconnect', async function(){

        var userId= socket.handshake.auth.token;
        const UserData1 =await Users.findOne({_id:userId});
         console.log("User Disconnected: "+ UserData1.fullName);

        await Users.findByIdAndUpdate({_id : userId}, { $set:{ isOnline:'0'}});

        //User Offline Status Broadcast
        socket.broadcast.emit('getOfflineUser', {user_id: userId});

    });
    
    //Chatting Implementation
    socket.on('newChat', function(data){
        socket.broadcast.emit('loadNewChat', data);});
    

    //Load OLd Chats
    socket.on('existsChat', async function(data){
        var chats1 = await Chats.find({$or:[
            {sender_id: data.sender_id, receiver_id: data.receiver_id},
            {sender_id: data.receiver_id, receiver_id: data.sender_id},
        ]});

        for(let i=0; i< chats1.length; i++)
        {
          //console.log("Upper:   "+encryptdecrypt.decrypt(chats1[i]['message']));
          chats1[i]['message']= encryptdecrypt.decrypt(chats1[i]['message']);  
        }
        console.log(chats1.length);
        socket.emit('loadChats', {chats1: chats1});
        });
});


 //Routes to different web pages
 
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({extended:false}));

const static_path= path.join(__dirname, "../public");
const templates_path= path.join(__dirname, "../templates/views");

app.use(express.static(static_path));
app.set("view engine", "hbs");
app.set("views", templates_path);


///Rate limitter for DoS(or Brute Force) Attack

const indexlimitter = limitter({
    windowMs: 60000, // Only 20 counts of site request in 3 minute from a particular IP address
    max:5,
    message: {
        code: 429,
        message: 'Too many request, please try again later'
    }
});

/// Rendering index page
app.get("/", indexlimitter, (req, res) => {
    res.render("index");
});

app.get("/login", (req,res)=>{
    res.render("index");
})

//login check
app.post("/login",   [
    check('email', 'Email length should be 10 to 30 characters')
                    .isEmail().isLength({ min: 10, max: 30 }),
    check('password', 'Password length should be 8 to 12 characters')
                    .isLength({ min: 8, max: 12 })
], async(req, res) => {
    const errors = validationResult(req);
    if(errors.isEmpty() )
    {
        const emailent = req.body.email;
        const passwordent = req.body.password;
        
        const userData =await Users.findOne({email:emailent});
        if(userData !== null)
        {
        const userdecpass = encryptdecrypt.decrypt(userData.password);
        
        const token= await userData.generateAuthToken();
        console.log(token);

        res.cookie("jwt", token, {
            expires: new Date(Date.now() + 600000),
            httpOnly:true,
        });

        if(passwordent == userdecpass)
        {
            res.status(201).render("otp", {user: userData});
            
        }
        else{
            res.send("password are not matching");
        }
    }
    else{
        res.send("Email does not exist.");
    }
}
else{
    res.json(errors);
}
});

app.get("/register", (req, res) => {
    res.render("index");
});

///// User Registeration 
app.post("/register",  [
    check('fullName', 'Name length should be 10 to 20 characters')
                    .isLength({ min: 10, max: 20 }),
    check('email', 'Email length should be 10 to 30 characters')
                    .isEmail().isLength({ min: 10, max: 30 }),
    check('phone', 'Mobile number should contains 10 digits')
                    .isLength({ min: 10, max: 10 }),
    check('password', 'Password length should be 8 to 12 characters')
                    .isLength({ min: 8, max: 12 })
], async(req, res) => {
   
    const emailent = req.body.email;
    const userData =await Users.findOne({email:emailent});
    const password = req.body.password;
     // validationResult function checks whether
    // any occurs or not and return an object
    const errors = validationResult(req);

    const encpass = encryptdecrypt.encrypt(password);
    
    if(errors.isEmpty() )
    {
        const registeruser = new Users({
            fullName : req.body.fullName,
            email : req.body.email,
            phone : req.body.phone,
            password : encpass,
    })

    const token= await registeruser.generateAuthToken();

    res.cookie("jwt", token, {
        expires: new Date(Date.now() + 600000),
        httpOnly:true
    });

    const registered = await registeruser.save();
    res.status(201).redirect("/otp");
}
else{
    res.json(errors);
}
}
);


app.get("/otp", auth, async(req, res) => {
    res.render("otp", {user: req.user});
})

app.post("/otp", auth, async(req, res) => {
    res.redirect("/chat");
})

app.get("/chat", auth, async(req, res) => {
    try{
    var users = await Users.find({ _id: { $nin:[req.user._id] } });
    res.render("chat.ejs", {user: req.user, users: users});
    }
    catch(error){
        console.log(error.message);
    }
});

app.post("/save-chat", async(req, res) =>{
    try {
        var text = req.body.message;
        const encmessage= encryptdecrypt.encrypt(text);
        var chat= new Chats({
            sender_id: req.body.sender_id,
            receiver_id: req.body.receiver_id,
            message: encmessage
        });
        console.log("ID:"+chat._id);

        var newChat= await chat.save();
        var nnChat= newChat;
        nnChat.message= encryptdecrypt.decrypt(newChat.message);
        //console.log(nnChat.message);

        res.status(200).send({success:true, msg:'Chat inserted!', data:newChat});

    } catch (error) {
        res.status(400).send({success:false, msg:error.message});
    }
});


app.get("/logout1", auth, (req, res) => {
    try{res.render("logout1");}
    catch(error){ res.status(400).send(error);}
});

app.get("/logout", auth, async(req, res) => {
    try {
      req.user.tokens =[];
        res.clearCookie("jwt");
        //console.log("Logout Successfully");
        await req.user.save();
        res.render("logout1");
    } catch (error) {
        res.status(400).send(error);
    }
});


////// Rendering images and css files

app.get("/style1.css", (req, res) => {
    res.sendFile(path.join(__dirname, "/public/css/style1.css"));
});

app.get("/style2.css", (req, res) => {
    res.sendFile(path.join(__dirname, "/public/css/style2.css"));
});

app.get("/style3.css", (req, res) => {
    res.sendFile(path.join(__dirname, "/public/css/style3.css"));
});

app.get("/style4.css", (req, res) => {
    res.sendFile(path.join(__dirname, "/public/css/style4.css"));
});

app.get("/style5.css", (req, res) => {
    res.sendFile(path.join(__dirname, "/public/css/style5.css"));
});

app.get("/stylesheet.css", (req, res) => {
    res.sendFile(path.join(__dirname, "/public/css/stylesheet.css"));
});

app.get("/search1.jpg", (req, res) => {
    res.sendFile(path.join(__dirname, "/public/images/search1.jpg"));
});

app.get("/logo.jpg", (req, res) => {
    res.sendFile(path.join(__dirname, "/public/images/logo.jpg"));
});

app.get("/attach.png", (req, res) => {
    res.sendFile(path.join(__dirname, "/public/images/attach.png"));
});

app.get("/channel.png", (req, res) => {
    res.sendFile(path.join(__dirname, "/public/images/channel.png"));
});

app.get("/unnamed.png", (req, res) => {
    res.sendFile(path.join(__dirname, "/public/images/unnamed.png"));
});


//Models
const Users = require("./models/Register.js");
const Chats = require("./models/UserChat.js");


	