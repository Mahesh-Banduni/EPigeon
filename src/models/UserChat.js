const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema({
    sender_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Users'
    },
    receiver_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Users'
    },
    message: {
        type:String,
        required:true,
    }
},
{timestamps: true}
);

const Chats = new mongoose.model('Chats', chatSchema);
module.exports = Chats;
