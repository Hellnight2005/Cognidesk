const mongoose = require("mongoose");
const { UserSchema } = require("../../shared-models");

module.exports = mongoose.model("User", UserSchema);
