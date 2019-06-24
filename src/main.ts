//////////////////////////////////////////
// Author: Dahmitri Stephenson
// Discord: Jimoori#2006
// Jimbot: Discord Bot
//////////////////////////////////////////

import * as Discord from "discord.js";
import * as request from "request";
import * as fs from "fs";
import * as cheerio from "cheerio";
import * as https from "https";
import * as http from "http";

//import "./global.js";
import "./string/string-extension.js";
import { log, logData, checkString, compareStrings, escapeString } from "./global.js";
import {Client} from "./discord.js";
import {config} from "./config/config.js";
import {cache} from "./cache/cache.js";
import {handle} from "./commands/handles.js";
import * as Editor from "./editor/Edit.js";
import * as Commands from "./commands/commands.js";

var editor = null;


process.on("unhandledRejection", (reason, p) => {
    log(`Unhandled Rejection at: Promise(${p}), Reason: ${reason}`);
    // application specific logging, throwing an error, or other logic here
});

// Initialize Client

Client.init(() => {

    editor = new Editor.Edit();
    editor.init((msg, key, file) => {
        log("Response From Editor");
        cache.reload();
        config.reload();

        Client.respondSuccess(msg, true);

        const com = Commands.getCommandObject(`whatis ${key}`, null, null);
        handle(msg, com);
    }, (msg) =>{
        log("Response From Editor");
        Client.respondFailure(msg, true);
    })

    log("Configuration Loaded");

    Client.setMessageCallback(onMessage.bind(this));
    Client.setPrivateMessageCallback(onPrivateMessage.bind(this));
});

function onPrivateMessage(receivedMessage, content) {

    var id = receivedMessage.author.id;
    
    log("Private Message From: " + id);
    log(content)

    if (editor.isEditing(id)) {
        log("Is Editor");
        editor.editorResponse(receivedMessage);
        return;
    }
    
    log("Settings Change Allowed");

    const com = Commands.getCommandObject(content, null, null);
    log("\nCommand Obect");
    log(com);

    const command = com.command;
    const parameters = com.parameters;
    const search = com.search;

    try {
        if (command == "Setinfo") {
            log("Settings Change")

            editor.SetInfo(Client, receivedMessage);
            return;
        }

        if (!search && parameters.length === 0) {
            log("Could not parse search string");
            Client.respondFailure(receivedMessage, true);
            return;
        }

        handle(receivedMessage, com);
        if (command == "Addinfo") {
            editor.AddInfo(receivedMessage, search);
        }
    } catch(e) {
        log("Failed: " + e);
        Client.respondFailure(receivedMessage, true);
    }
}
function onMessage(receivedMessage, content) {
    
    const guildId = receivedMessage.guild.id;

    const attachment = receivedMessage.attachments.first();
    if (attachment) {
        log("Message Attachments");
        log(attachment.url);
    }

    // Get command information
    var com = Commands.getCommandObject(content, attachment, Client.guildSettings[guildId]);

    try {
        handle(receivedMessage, com);
    } catch (e) {
        log(e);
        log("Command doesn't exist");
    }
}
