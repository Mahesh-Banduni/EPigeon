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


/// Socket.IO User Namespace
/// Socket.IO User Namespace
const usp = io.of('/user-namespace');

usp.on('connection', async (socket) => {
    const userId = socket.handshake.auth.token;

    try {
        const user = await Users.findById(userId);
        console.log("User Connected:", user.fullName);

        // Mark user online
        await Users.findByIdAndUpdate(userId, { $set: { isOnline: '1' } });

        // Broadcast online status
        socket.broadcast.emit('getOnlineUser', { user_id: userId });

        // Typing status
        socket.on('typing', (data) => {
            socket.broadcast.emit('userTyping', data);
        });

        // Load chat between two users
        socket.on('existsChat', async (data) => {
            const chats = await Chats.find({
                $or: [
                    { sender_id: data.sender_id, receiver_id: data.receiver_id },
                    { sender_id: data.receiver_id, receiver_id: data.sender_id }
                ]
            }).sort({ createdAt: 1 });

            // Decrypt messages
            chats.forEach(chat => {
                chat.message = encryptdecrypt.decrypt(chat.message);
            });

            socket.emit('loadChats', { chats1: chats });
        });

        // New chat message
        socket.on('newChat', (data) => {
            socket.broadcast.emit('loadNewChat', data);
        });

        // On disconnect
        socket.on('disconnect', async () => {
            const userData = await Users.findById(userId);
            console.log("User Disconnected:", userData.fullName);

            await Users.findByIdAndUpdate(userId, { $set: { isOnline: '0' } });

            // Broadcast offline status
            socket.broadcast.emit('getOfflineUser', { user_id: userId });
        });

    } catch (err) {
        console.error("Socket error:", err.message);
    }
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

        res.cookie("jwt", token, {
            expires: new Date(Date.now() + 1800000), //30 minutes
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

app.get("/chat", auth, async (req, res) => {
    try {
        const users = await Users.find({ _id: { $nin: [req.user._id] } });
        res.render("chat.ejs", { user: req.user, users });
    } catch (error) {
        console.log("Chat page error:", error.message);
        res.status(500).send("Internal Server Error");
    }
});

// Save new chat message
app.post("/save-chat", async (req, res) => {
    try {
        const { sender_id, receiver_id, message } = req.body;
        const encMessage = encryptdecrypt.encrypt(message);

        const chat = new Chats({ sender_id, receiver_id, message: encMessage });
        const savedChat = await chat.save();

        savedChat.message = encryptdecrypt.decrypt(savedChat.message);

        res.status(200).send({ success: true, msg: 'Chat inserted!', data: savedChat });
    } catch (error) {
        res.status(400).send({ success: false, msg: error.message });
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


	