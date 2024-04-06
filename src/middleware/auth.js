const jwt = require("jsonwebtoken");
const Users= require("../models/Register");

const auth = async(req, res, next) => {
    try {
       const token = req.cookies.jwt;
       const verifyUser = jwt.verify(token, process.env.SECRET_KEY);
       
       const user = await Users.findOne({_id:verifyUser._id});

       req.token = token;
       req.user= user;

       next();
    } catch (error) {
        res.status(401).send("To access the requested page, you need to login first");
    }
}

module.exports = auth;