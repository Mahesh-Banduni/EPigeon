
const crypto = require("crypto");

// Defining key
const key = crypto.createHash("sha512").update(process.env.key).digest("hex").substring(0,32);
 
// Defining iv
const iv = crypto.createHash("sha512").update(process.env.iv).digest("hex").substring(0,16);
 
// An encrypt function
const encrypt = function(text){
 
 const cipher = crypto.createCipheriv(process.env.algorithm, key, iv);
 
 const encrypted = cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
 
 return Buffer.from(encrypted).toString('base64');
}
 
// A decrypt function


const decrypt= function(etext) {
   let buff = Buffer.from(etext, 'base64');
   etext = buff.toString('utf8');
   let decipher = crypto.createDecipheriv(process.env.algorithm, key, iv);
   
   return decipher.update(etext, 'hex', 'utf8') + decipher.final('utf8');
  }

  // Hashmes function
const hashmes= function(password) {
   const key = crypto.scryptSync(process.env.SECRET_KEY, 'salt', 32);
   const hash = crypto.pbkdf2Sync(password, key, 1000, 64, 'sha512').toString('hex');
   return hash;
 }

const add= function(){
   return 4+5;
}

module.exports= {
   encrypt,decrypt,hashmes,add
};