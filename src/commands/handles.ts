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

import { log, logData, checkString, compareStrings, escapeString } from "../global.js";
import "../string/string-extension.js";
import { Client } from "../discord.js";
import {config} from "../config/config.js";
import {cache} from "../cache/cache.js";
import * as constants from "../constants.js";
import * as Commands from "./commands.js";
const puppeteer = require('puppeteer')

const pinkHexCode = 0xffd1dc;
const linkFilter = [
    /\|Trial/,
    /\|Event/,
    /\|Quest/,
    /\]\]/,
    /\[\[/,
    /\[\[.*\]\]/,
    /\(/,
    /\)/
];
const okEmoji = "🆗";
const cancelEmoji = "❌";

const wikiEndpoint = "https://www.dndbeyond.com/"
const jimooriUserID     = "131139508421918721";

const guildId = (msg) => msg.guild.id;
const userId = (msg) => msg.author.id;

// COMMANDS

// FLUFF
function handleReactions(receivedMessage) {
    const content = receivedMessage.content.toLowerCase();
    switch (content) {
        default:
            break;
    }
}
function handleEmote(receivedMessage) {
    var img = receivedMessage.content.split(" ")[0];
    img = img.toLowerCase().slice(1, img.length);

    var filename = validateEmote(img);
    if (!filename) return;

    Client.sendImage(receivedMessage, filename);
}
function handleQuote(receivedMessage, search) {
    //var s = getSearchString(quoteQueryPrefix, content).toLowerCase();
    switch (search) {
        case "morrow":
            Client.send(receivedMessage, new Discord.Attachment("morrow0.png"));
            break;
        default:
            break;
    }
}

// INFORMATION

function handleWhatis(receivedMessage, search, parameters) {

    var info = cache.getInformation(search)
    if (!info) {
        return;
    }
    
    var embed = {
        color: pinkHexCode,
        title: info.title,
        description: info.description
    };

    Client.sendMessageWithAuthor(receivedMessage, embed, info.author);
}
function handleGuide(receivedMessage, search, parameters) {
    handleWhatis(receivedMessage, search, parameters);
}
function handleG(receivedMessage, search, parameters) {
    handleWhatis(receivedMessage, search, parameters);
}
function handleHelp(receivedMessage) {
    var data = fs.readFileSync("readme.json", "ASCII");
    var readme = JSON.parse(data);

    var embed = {
        color: pinkHexCode,
        description: readme.description,
        fields: readme.fields,
        title: readme.title
    };

    Client.sendPrivateMessage(receivedMessage, embed);
}


// ADDING RESOURCES
function handleAddemo(receivedMessage, search, parameters) {
    var s = receivedMessage.content.split(" ");

    if(!parameters) {
        log("Error with command, no parameters provided.");
        return;
    }

    var name = "";
    var url = "";
    if (parameters && parameters.length > 0) {
        name = search;
        url = parameters[0];
    } else if (s) {
        if (!s[1] || !s[2]) {
            return;
        }

        name = s[1];
        url = s[2];
    } else {
        log("Error with command, emote could not be added.");
        return;
    }

    var existing = validateEmote(name);
    if (existing) {
        var Attachment = new Discord.Attachment(existing);
        if (Attachment) {
            
            var embed = {
                title: "Conflict",
                description:
                    "This emote already exists with this name, do you want to overwrite it?",
                color: pinkHexCode,
                image: {
                    url: `attachment://${existing}`
                },
                files: [{ attachment: `${existing}`, name: existing }]
            };

            Client.sendMessage(receivedMessage, embed, message => {
                
                message.react(okEmoji);
                message.react(cancelEmoji);

                const filter = (reaction, user) =>
                                (reaction.emoji.name === okEmoji || reaction.emoji.name === cancelEmoji) &&
                                user.id !== message.author.id;

                message.awaitReactions(filter, { max: 1, time: 60000 })
                    .then(collected => {
                        const reaction = collected.first().emoji.name;
                        const count = collected.size;

                        if (count === 1 && reaction === okEmoji) {

                            overwriteFile(existing, url, result => {
                                const guildId = receivedMessage.guild.id;
                                receivedMessage.guild.emojis.forEach(customEmoji => {
                                    if (customEmoji.name === Client.getSuccess(guildId)) {
                                        message.delete();
                                        //receivedMessage.reply(`Emote has been replaced. :${customEmoji}:`);
                                        respondSuccess(receivedMessage);
                                    }
                                });
                            });
                        } else if (count === 0 || reaction === cancelEmoji) {
                            log("AddEmo - no response");
                            message.delete();
                            respondFailure(receivedMessage);
                        }
                    })
                    .catch(collected => {
                        log("AddEmo - no response");
                        message.delete();
                        respondFailure(receivedMessage);
                    });
            });
        }
    } else {
        downloadFile(name, url, result => {
            log(result);
            respondSuccess(receivedMessage);
        });
    }
}
function handleAddshortcut(receivedMessage, search, parameters) {
    var command = parameters[0];
    
    log("Set Information");
    log(`Shortcut: ${search}`);
    log(`Command: ${command}`);

    if (Client.validateEditor(guildId(receivedMessage), userId(receivedMessage))) {
        log("User is not an editor");
        return;
    }

    if (Client.setShortcut(guildId(receivedMessage), search, command)) {
        respondSuccess(receivedMessage, true);
    } else {
        respondFailure(receivedMessage, true);
    }
}
function handleAddresponse(receivedMessage, search, parameters) {

    var command = parameters[0];
    if (parameters.length == 2) {
        search = parameters[0];
        command = parameters[1];
    }
    
    log("Add Response");
    log(`Shortcut: ${search}`);
    log(`Command: ${command}`);

    if (Client.setResponse(guildId(receivedMessage), search, command)) {
        respondSuccess(receivedMessage, true);
    } else {
        respondFailure(receivedMessage, true);
    }
}


// SETTINGS
function handleSet(receivedMessage, search, parameters) {
    if (!search || parameters.length === 0) {
        return;
    }

    const guildId = receivedMessage.guild.id;
    const setting = Client.guildSettings[guildId];

    var embed = {
        title: `Settings for '${search}'`,
        description: JSON.stringify(setting)
    }

    Client.sendMessage(receivedMessage, embed);
}
function handleSetinfo(receivedMessage, search, parameters) {
    if (receivedMessage.guild) {
        return;
    }

    var title = parameters[0];
    var desc = parameters[1];
    
    log("Set Information");
    log(`Title: ${title}`);
    log(`Desc: ${desc}`);

    if (cache.setInformation(search, title, desc, receivedMessage.author.id)) {
        respondSuccess(receivedMessage, true);
    } else {
        respondFailure(receivedMessage, true);
    }
}
function handleAddinfo(receivedMessage, search, parameters) {
    
    if (receivedMessage.guild) {
        return;
    }

    log(`Add Information: ${search}`);

    if (cache.setInformation(search, "title", "desc", receivedMessage.author.id)) {
        respondSuccess(receivedMessage, true);
    } else {
        respondFailure(receivedMessage, true);
    }
}
function handlePrefix(receivedMessage) {
    if (
        receivedMessage.member.roles.find(r => r.name === "Admin") ||
        receivedMessage.member.roles.find(r => r.name === "Mod")
    ) {
        // TODO: Add logic to change prefix to a valid character.
        log("User Is Admin");
        var s = receivedMessage.content.split(" ");
        if (!s[1] || s[1].length !== 1) {
            log("Invalid Prefix");
            respondFailure(receivedMessage);
            return;
        }

        Client.setPrefix(receivedMessage.guild.id, s[1]);

        respondSuccess(receivedMessage);
    }
}
function handleReload(receivedMessage, search, parameters) {

    var id = receivedMessage.author.id;
    if (id != jimooriUserID) {
        return;
    }

    log("Handle Reload");

    try {
        cache.reload();
        config.reload();
        Client.reload();
    } catch(e) {
        log(e);
        respondFailure(receivedMessage, true);
    }

    log("Finished Reloading");
    respondSuccess(receivedMessage, true);
}


function parseTable($, table) {
    var results = [],
    headings = [];

    table.first()
         .find("th")
         .each(function (index, value) {
            var head = $(value).text();
            if (!head.empty()) {
                head = head.replaceAll("\n", "");
                headings.push(head);
            }
        });

    if (headings.length == 0) {

        table.find("thead").first()
        .find("td")
        .each(function (index, value) {
            var head = $(value).text();
            if (!head.empty()) {
                head = head.replaceAll("\n", "");
                headings.push(head);
            }
        });
    }
        
    log(`table head`);
    log(headings)

    table.each((tableIndex, element) => {
        $(element)
        .find("tbody")
        .children("tr")
        .each(function (indx, obj) {
            var row = {};
            var tds = $(this).children("td");

            tds.each(function (ind) {
                var value = $(this).text();
                value = value.replaceAll("\n", "");
                value = value.replaceAll(" ", "_");

                log(`table cell: ${value}`);

                // var links = $(this).children("img");
                // links.each(function (i) {
                //     value += $(this).attr("alt") + "\n";
                // });

                var key = headings[ind];
                row[key] = `${value}`;
            });

            results.push(row);
        });
    });

    console.log(results);
    return {
        heads: headings,
        rows: results
    };
}

function extractPageTextFormatted(receivedMessage, body, search, callback) {


    const htmlString = `<html>
    <head>
        <title></title>
    </head>
    <body>
        ${body.html()}
    </body>
    </html>`;

    (async () => {
    const browser = await puppeteer.launch()
    const page = await browser.newPage()
    await page.setContent(htmlString)
    await page.screenshot({path: `tempimg/${search}.png`})
    await browser.close()
    callback(`${search}.png`);
    })()

    

    /*
    if (body.children().length > 0) {
        body.children().each((ind, e) => {
            log("Extracting Child: " + $(e).html());
            extractPageTextFormatted($, $(e), total);
        })
    } else {
        log("No more children: ");
        log(body.html());
        log("------------------");
        //if (body.is("p")) {
            total(body.text() + "\n"); 
        //}
    }*/
}
function dnd5eParsePage(receivedMessage, source, selector, title, error) {

    log(source);
    var protocol = source.slice(0, 5) === 'https' ? https : http;
    protocol.get(source, function(response) {
        if (response.statusCode !== 200) {
            log(`Page not found! (${source})`);
            respondFailure(receivedMessage, true);
            return;
        }

        var body = "";
        response.on('data', function(chunk) {
            body += chunk;
        });
        response.on("end", function() {
    
            const $ = cheerio.load(body);
            const page = $(selector).first()
            if (page.length == 0) {
                log(`Page content not found! (${source})`);
                if (error) error();
                return;
            }
    
            //const header = page.children(".page-title").first();
            //const content = page.children("#content").first();

            var total = "";
            extractPageTextFormatted(receivedMessage, page, title.toLowerCase().replaceAll(" ", ""), (img) => {

                /*
                const attachment = new Discord.Attachment('./card_images/sample.png', 'sample.png');
                const embed = new Discord.RichEmbed()
                        .setTitle('Wicked Sweet Title')
                        .attachFile(attachment)
                        .setImage('attachment://sample.png');
                */
                receivedMessage.channel
                    .send({
                        embed: {
                            title: title.toTitleCase(),
                            url: source,
                            color: pinkHexCode,
                            image: {
                                url: `attachment:///${img}`
                            },
                        },
                        files: [{
                            attachment: `tempimg/${img}`,
                            name: `${img}`
                        }]
                    })
                    .then(message => {
                    })
                    .catch(e => {
                        console.error(e);
                    });
            });

            /*
            var contentText = page.text().allTrim();
            // log(page.html());
            // log(contentText);
    
            var embed = <any>{
                title: title.toTitleCase(),
                url: source,
                color: pinkHexCode,
                description: contentText
            }
    
            Client.sendMessage(receivedMessage, embed, null, (e) => {
                Client.send(receivedMessage, `${title.toTitleCase()}\n${contentText}`);
            });
            */
        });
    }).on('error', function(e) {
        console.log("Got error: " + e.message);
    });
}

function dndParseItemPage(receivedMessage, source, title, error) {

    log(source);
    var protocol = source.slice(0, 5) === 'https' ? https : http;
    protocol.get(source, function(response) {
        if (response.statusCode !== 200) {
            log(`Page not found! (${source})`);
            respondFailure(receivedMessage, true);
            return;
        }

        var body = "";
        response.on('data', function(chunk) {
            body += chunk;
        });
        //log(response);
        response.on("end", function() {
            log(body);
    
            const $ = cheerio.load(body);
            const page = $("#content").first()
            if (page.length == 0) {
                if (error) error();
                return;
            }
    
            //const header = page.children(".page-title").first();
            //const content = page.children("#content").first();
            const table = page.find("table").first();
            
            console.log("FOUND TABLE " + table.length)
    
            var fields = [];
            if (table.is("table")) {
                log("Not Table");

                log(table.html());

                var results = parseTable($, table);
                var totalHead = "";
                results.heads.forEach((head, ind) => {
                    if (ind > 0) totalHead += ", ";
                    totalHead += `${head}`;
                });

                /*
                results.rows.forEach(row => {
                    var total = "";

                    var keys = Object.keys(row);
                    keys.forEach((key, ind) => {
                        if (ind == 0) return;
                        if (ind > 1) total += ", ";
                        total += `${row[key]}`;
                    })

                    var name = row[keys[0]].replaceAll("_", " "); 
                    fields[fields.length] = {
                        name: name,
                        value: total
                    }
                });*/

                var total = "";
                results.rows.forEach(row => {

                    var keys = Object.keys(row);
                    keys.forEach((key, ind) => {
                        var text = row[key].replaceAll("_", " ");
                        if (ind == 0) {
                            total += `**${text}: **`;
                        } else {
                            total += `${text}, `;
                        }
                    })

                    total += "\n";
                });
                fields[fields.length] = {
                    name: totalHead,
                    value: total
                }

                log(fields);
                
                /*
                results.forEach(row => {
                    var keys = Object.keys(row);
                    keys.forEach((val) => {
                        fields[fields.length] = {
                            name: val.capitalize(),
                            value: row[val],
                            inline: true
                        }
                    });
                });*/
            }

            var contentText = page.find("p").first().text().allTrim();
            console.log(contentText);
    
            var embed = <any>{
                title: title.toTitleCase(),
                url: source,
                color: pinkHexCode,
                description: contentText,
                fields: fields
            }
    
            Client.sendMessage(receivedMessage, embed, null, (e) => {
                Client.send(receivedMessage, `${title.toTitleCase()}\n${contentText}`);
            });
        });
    }).on('error', function(e) {
        console.log("Got error: " + e.message);
    });
}
function dndParseSpellPage(receivedMessage, source, title, error) {

    log(source);
    var protocol = source.slice(0, 5) === 'https' ? https : http;
    protocol.get(source, function(response) {
        if (response.statusCode !== 200) {
            log(`Page not found! (${source})`);
            if (error) error();
            return;
        }

        var body = "";
        response.on('data', function(chunk) {
            body += chunk;
        });
        response.on("end", function() {
            log(body);
    
            const $ = cheerio.load(body);
            const page = $("#content").first()
            if (page.length == 0) {
                if (error) error();
                return;
            }
    
            const table = page.find(".ddb-statblock").first();
            const desc = $(".more-info-content").first()
            
            var fields = [];
            var school = "";
            table.children(".ddb-statblock-item")
                 .each(function (index, value) {

                    var head = $(this).children(".ddb-statblock-item-label").first().text().allTrim();
                    head = head.replaceAll("\n", "");
                    var text = $(this).children(".ddb-statblock-item-value").first().text().allTrim();
                    text = text.replaceAll("\n", "");

                    if (head.toLowerCase().includes("school")) 
                        school = text.toLowerCase().replaceAll(" ", "");

                    fields.push({
                        name: head,
                        value: text,
                        inline: true
                    });
                });

            log(fields);
            log(`${school} Spell Icon: ${ constants.spellIcons[school]}`);

            var contentText = desc.text().allTrim();
            log(contentText);
    
            var embed = <any>{
                title: title.toTitleCase(),
                url: source,
                color: pinkHexCode,
                description: contentText,
                fields: fields//, 
                // thumbnail: {
                //     url: constants.spellIcons[school]
                // },
            }
    
            Client.sendMessage(receivedMessage, embed, null, (e) => {
                Client.send(receivedMessage, `${title.toTitleCase()}\n${contentText}`);
            });
        });
    }).on('error', function(e) {
        log("Got error: " + e.message);
    });
}

function handleSpell(receivedMessage, search, parameters) {
    search = search.replaceAll("_", "-");

    var source = `${wikiEndpoint}spells/${search}`
    dndParseSpellPage(receivedMessage, source, search, () => {
        dnd5eParsePage(receivedMessage, `http://dnd5e.wikidot.com/spell:${search}`, ".main-content", search, ()=>{
            respondFailure(receivedMessage, true);
        });
    });
}
function handleBackground(receivedMessage, search, parameters) {
    search = search.replaceAll("_", "-");

    var source = `http://dnd5e.wikidot.com/background:${search}`
    dndParseItemPage(receivedMessage, source, search, () => {
    });
}
function handleFeat(receivedMessage, search, parameters) {
    search = search.replaceAll("_", "-");

    var source = `http://dnd5e.wikidot.com/feat:${search}`
    dndParseItemPage(receivedMessage, source, search, () => {
    });
}
function handleEquipment(receivedMessage, search, parameters) {
    //https://www.dndbeyond.com/equipment/antimatter-rifle

    search = search.replaceAll("_", "-");

    var source = `${wikiEndpoint}equipment/${search}`
    dndParseItemPage(receivedMessage, source, search, () => {
    });
}
function handleMagicitem(receivedMessage, search, parameters) {
    //https://www.dndbeyond.com/magic-items/adamantine-armor

    search = search.replaceAll("_", "-");

    var source = `${wikiEndpoint}magic-items/${search}`
    dnd5eParsePage(receivedMessage, source, ".primary-content", search, ()=>{
        respondFailure(receivedMessage, true);
    });
    // dndParseItemPage(receivedMessage, source, search, () => {
    // });
}
//https://www.dndbeyond.com/monsters/aboleth
function handleMonsters(receivedMessage, search, parameters) {
    //https://www.dndbeyond.com/magic-items/adamantine-armor

    search = search.replaceAll("_", "-");

    var source = `${wikiEndpoint}monsters/${search}`
    dnd5eParsePage(receivedMessage, source, ".primary-content", search, ()=>{
        respondFailure(receivedMessage, true);
    });
    // dndParseItemPage(receivedMessage, source, search, () => {
    // });
}

/////////////////////////////////////////////////
// RESPONSE

function respondSuccess(receivedMessage, toUser = false) {
    Client.respondSuccess(receivedMessage, toUser);
}
function respondFailure(receivedMessage, toUser = false) {
    Client.respondFailure(receivedMessage, toUser);
}


/////////////////////////////////////////////////
// PARSING HELPERS

function isLetter(str) {
    return str.length === 1 && str.match(/[a-z]/i);
}

function convertSearchTerm(search) {
    //search = search.toLowerCase();
    search = search.replaceAll(" ", "_");
    return search;
}
function convertValueToLink(value) {
    
    var link = value;
    linkFilter.forEach(filter => {
        link = link.replace(filter, "");
    });
    
    var title = link.toTitleCase("_");
    title = title.replace("Ss_", "SS_");
    title = title.replace("Cg_", "CG_");
    title = title.replaceAll("_", " ");

    link = `[${title}](${wikiEndpoint + link.replaceAll(" ", "_")}) `;
    //log("Converted Link: " + link);
    return link;
}

function getSearchString(prefix, msg, replace = true) {
    var ind = prefix.length + 1;
    var search = msg.slice(ind, msg.length);

    if (search.empty()) {
        return null;
    }

    search = search.toLowerCase();
    search = search.replaceAll(" ", "_");
    return search;
}
function getCommandString(msg, prefix) {
    var split = msg.split(" ")[0];
    split = split.replace(prefix, "").capitalize();

    if (split.empty()) {
        return null;
    }

    return split;
}
function getParameters(msg) {

    var parameters = [];
    var params = msg.match(/"[^"]+"|‘[^‘]+‘|‘[^’]+’|“[^“]+“|”[^”]+”|“[^“^”]+”|'[^']+'/g);
    if (params) {
        parameters = params;

        parameters.forEach((p, ind) => {
            msg = msg.replace(p, "");
            parameters[ind] = p.replace(/'|"|‘|’|“|”/g, "");
        });
        msg = msg.trim();
    }

    return { msg: msg, parameters: parameters };
}

function validateEmote(emote) {
    var file = null;

    const types = config.filetypes();
    for (var i = 0; i < types.length; i++) {
        var filename = "emotes/" + emote + types[i];
        if (fs.existsSync(filename)) {
            file = filename;
            break;
        }
    }

    return file;
}
function getQuotedWord(str) {
    if (str.replace(/[^\""]/g, "").length < 2) {
        return null;
    }

    var start = str.indexOf('"');
    var end = str.indexOfAfterIndex('"', start + 1);
    var word = str.substring(start + 1, end);
    log(start);
    log(end);
    log("Quoted Word: " + word);

    if (word.empty()) {
        return null;
    }

    return word;
}
function getFileExtension(link) {
    return link.substring(link.lastIndexOf("."), link.length);
}
function overwriteFile(existing: string, url, callback) {
    fs.unlink(existing, err => {
        if (err) {
            log(err);
            return;
        }

        downloadFile(existing.slice(existing.lastIndexOf("/"), existing.lastIndexOf(".")), url, result => {
            log(result);

            callback(result);
        });
    });
}
function downloadFile(name, link, callback) {
    var ext = link.substring(link.lastIndexOf("."), link.length).toLowerCase();
    if (!config.filetypes().includes(ext)) {
        log("Invalid img URL");
        return;
    }

    const file = fs.createWriteStream("emotes/" + name + ext);
    const request = https.get(link, function (response) {
        response.pipe(file);
        callback("success");
    });
}


/////////////////////////////////////////////////

export function handle(receivedMessage, com: Commands.CommandObject): boolean {
    
    log("\nHandle Command Obect");
    log(com);

    try {
        var search = com.search;
        var parameters = com.parameters;

        if (com.attachment)
            parameters[parameters.length] = com.attachment;

        eval(com.run);
    } catch (e) {
        log(e);
        log("Command doesn't exist");

        if (Client.validate(receivedMessage, "emote")) {
            handleEmote(receivedMessage);
        } else {
            log("Emotes are disabled for this user");
        }
    }

    return false;
}

