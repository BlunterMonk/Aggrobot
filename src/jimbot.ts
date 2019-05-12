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

import { log, logData,
    checkString, compareStrings,
    escapeString } from "./global.js";
import "./string/string-extension.js";
import { Client } from "./discord.js";
import * as Config from "./config/config.js";
import * as Editor from "./editor/Edit.js";
import * as FFBE from "./ffbe/ffbewiki.js";
import * as Cache from "./cache/cache.js";
import * as constants from "./constants.js";
import * as Commands from "./commands/commands.js";


var config = null;
var editor = null;
var ffbe = null;
var cache = null;

var mainChannelID;
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

const wikiEndpoint = "https://exvius.gamepedia.com/";
const ffbegifEndpoint = "http://www.ffbegif.com/";
const exviusdbEndpoint = "https://exvius.gg/gl/units/205000805/animations/";

const renaulteUserID    = "159846139124908032";
const jimooriUserID     = "131139508421918721";
const furculaUserID     = "344500120827723777";
const muspelUserID      = "114545824989446149";

const sprite = (n) => `https://exvius.gg/static/img/assets/unit/unit_ills_${n}.png`;
const aniGL = (n) => `https://exvius.gg/gl/units/${n}/animations/`;
const aniJP = (n) => `https://exvius.gg/jp/units/${n}/animations/`;
const guildId = (msg) => msg.guild.id;
const userId = (msg) => msg.author.id;

var chainFamilies = JSON.parse(String(fs.readFileSync("data/chainfamilies.json")));
var ignoreEffectRegex = /grants.*passive|unlock.*\[.*CD\]/i;
var unitDefaultSearch = "tmr|stmr";
// Lookup Tables

const gifAliases = {
    "lb": "limit",
    "limit burst": "limit",
    "victory": "before",
    "win_before": "before",
    "win before": "before"
}
const searchAliases = [
    { reg: /imbue/g, value: "add element" },
    { reg: /break/g, value: "break|reduce def|reduce atk|reduce mag|reduce spr"},
    { reg: /buff/g, value: "increase|increase atk|increase def|increase mag|increase spr"},
    { reg: /debuff/g, value: "debuff|decrease|reduce"},
    { reg: /imperil/g, value: "reduce resistance"},
    { reg: /mit/g, value: "mitigate|reduce damage"},
    { reg: /evoke/g, value: "evoke|evocation"}
]

process.on("unhandledRejection", (reason, p) => {
    log(`Unhandled Rejection at: Promise(${p}), Reason: ${reason}`);
    // application specific logging, throwing an error, or other logic here
});



// Initialize Client

Client.init(() => {

    cache = new Cache.Cache();
    cache.init();

    editor = new Editor.Edit();
    editor.init((msg, key, file) => {
        log("Response From Editor");
        cache.reload();
        config.reload();

        respondSuccess(msg, true);
        handleWhatis(msg, key, null);
    }, (msg) =>{
        log("Response From Editor");
        respondFailure(msg, true);
    })

    ffbe = new FFBE.FFBE();
    
    config = new Config.Config();
    config.init();

    Commands.init(config);

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
            respondFailure(receivedMessage, true);
            return;
        }

        if (command == "Addinfo") {
            handleAddinfo(receivedMessage, search, parameters);
            editor.AddInfo(receivedMessage, search);
        } else if (command == "Setrank") {
            handleSetrankings(receivedMessage, search, parameters);
        } else if (command == "Setinfo") {
            handleSetinfo(receivedMessage, search, parameters);
        }
    } catch(e) {
        log("Failed: " + e);
        respondFailure(receivedMessage, true);
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
    log("\n Command Obect");
    log(com);

    if (unitQuery(receivedMessage, com.command, com.search)) {
        return;
    }

    try {
        var search = com.search;
        var parameters = com.parameters;

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
}




function getUnitData(id) {

    var filename = `tempdata/${id}.json`;
    if (fs.existsSync(filename)) {
        log(`Loading cached unit: ${id}`)
        var u = fs.readFileSync(filename);
        return JSON.parse(u.toString());
    }

    var cat = id[0];
    var bigUnits = fs.readFileSync(`data/units-${cat}.json`);
    var unitsList = JSON.parse(bigUnits.toString());

    var unit = unitsList[id];
    
    unitsList = null;
    bigUnits = null;
    if (!unit) {
        log("Could not find unit data");
        unit = null;
        return null;
    }

    log("Caching unit");
    if (!fs.existsSync(`tempdata/`))
        fs.mkdirSync( `tempdata/`, { recursive: true});
    if (!fs.existsSync(filename)) {
        fs.createWriteStream(filename);
    }
    fs.writeFileSync(filename, JSON.stringify(unit, null, "\t")); 

    return unit;
}

function searchUnitSkills(unit, keyword: RegExp, active) {

    var reg = /\([^\)]+\)/g;
    const LB = unit.LB;
    const skills = unit.skills;
    var found = [];
    var keys = Object.keys(skills);
    keys.forEach(key => {
        var skill = skills[key];
        if (active != undefined && skill.active != active) {
            //log(`Skipping Skill: ${skill.name} - ${skill.active}`);
            return;
        }

        let total = collectSkillEffects(key, skills, keyword, "");
        //log("\nTotal Text\n");
        //log(total);
        
        for (let index = 0; index < found.length; index++) {
            const el = found[index];
            if (el.name == skill.name && el.value == total) {
                //log(`Found Duplicate`);
                //log(`Name: ${el.name}, Value: ${el.value}, S: ${s}`);
                return;
            }
        }

        if (total.empty()) return;

        found[found.length] = {
            name: skill.name,
            value: total
        };
    });
        
    // Search LB
    if (LB && (active === undefined || active == true)) {
        var n = found.length;
        var s = "";

        var all = checkString(LB.name, keyword);
        log(`LB Name: ${LB.name}, All: ${all}`);

        LB.max_level.forEach(effect => {
            if (all || checkString(effect, keyword)) {
                s += `*${effect}*\n`;
                found[n] = {
                    name: `${LB.name} - MAX`,
                    value: s
                };
            }
        });
    }

    //log(`Searched Skills For: ${keyword}`);
    //log(found);

    return found;
}
function collectSkillEffects(key, skills, keyword, total) {
    var skill = skills[key];
    var all = checkString(skill.name, keyword);
    //log(`Skill Name: ${skill.name}, All: ${all}`);

    var reg = /\([^\)]+\)/g;
    for (let ind = 0; ind < skill.effects.length; ind++) {
        const effect = skill.effects[ind]
        if (checkString(effect, ignoreEffectRegex))
            continue;
        
        //log(`Skill Effect: ${effect}, Keyword: ${keyword}`);
        if (all || checkString(effect, keyword)) {
            let added = false;
            let match = reg.exec(effect);
            do {
                if (!match) break;

                let k = match[0].replace("(", "").replace(")", "");
                let subskill = skills[k];
                if (k != key && subskill && subskill.name.includes(skill.name) && !checkString(subskill.effects[0], ignoreEffectRegex)) {
                    //log(match);
                    //log(`Sub Skill: ${subskill.name}, Effect: ${subskill.effects}`);
                    subskill.effects.forEach(sub => {
                        total += `${sub}\n`;
                        added = true;
                    });
                    //total += collectSkillEffects(k, skills, keyword, total);
                }

                match = reg.exec(effect);
            } while(match);

            if (!added)
                total += `${effect}\n`;
        }
    }

    if (skill.strings.desc_short) {
        var desc = skill.strings.desc_short[0];
        if (checkString(desc, keyword)) {
            //log(`Description: ${desc}, keyword: ${keyword}`);
            //log(`Effects`);
            //log(skill.effects);
            total += `*"${desc}"*\n`;
        }
    }

    return total;
}
function searchUnitItems(unit, keyword: RegExp) {
    log(`searchUnitItems(${unit.name}, ${keyword})`);

    var found = [];

    const LB = unit.LB;
    if (LB && (checkString(LB.name, keyword) || checkString("lb", keyword))) {
        var n = found.length;
        var s = "";

        log(`LB Name: ${LB.name}`);

        LB.max_level.forEach(effect => {
            s += `*${effect}*\n`;
            found[n] = {
                name: `${LB.name} - MAX`,
                value: s
            };
        });
    }

    const TMR = unit.TMR;
    if (TMR && checkString("tmr", keyword)) {
        var n = found.length;

        log(`TMR Name: ${TMR.name}, Type: ${TMR.type}`);
        found[n] = equipToString(TMR);
    }

    const STMR = unit.STMR;
    if (STMR && checkString("stmr", keyword)) {
        var n = found.length;

        log(`STMR Name: ${STMR.name}, Type: ${STMR.type}`);
        found[n] = equipToString(STMR);
    }

    log(found);
    return found;
}
function searchUnitFrames(unit) {

    const LB = unit.LB;
    const skills = unit.skills;
    var families = {};
    var keys = Object.keys(skills);
    keys.forEach(key => {
        var skill = skills[key];
        if (!skill.active || !skill.attack_frames || 
            skill.attack_frames.length == 0 || skill.attack_frames[0].length <= 1) return;

        let frames = [];

        skill.attack_frames.forEach(element => {
            frames = frames.concat(element)
        });

        frames = frames.sort((a,b) => {
            return a - b;
        });
        //log(frames);
        let str = arrayToString(frames);
        if (!str.str.empty()) {
            let fam = `${str.fam}: ${str.str}`;
            if (!families[fam])
                families[fam] = [];

            if (families[fam].find(n => {return n == skill.name})) return;
            families[fam].push(skill.name);
        }
    });
        
    // Search LB
    if (LB && LB.attack_frames &&
        LB.attack_frames.length > 0 && LB.attack_frames[0].length > 1) {
        //log(LB.attack_frames);

        let str = arrayToString(LB.attack_frames[0]);
        if (str) {
            let fam = `${str.fam}: ${str.str}`;
            if (!families[fam])
                families[fam] = [];
            
            families[fam].push(`${LB.name} (LB)`);
        }
    }

    var found = [];
    //log(`Searched Skill Frames`);
    //log(families);
    let famKeys = Object.keys(families);
    famKeys.forEach(key => {
        const fam = families[key];
        let text = "";

        fam.forEach(skill => {
            text += `${skill}\n`;
        });

        found[found.length] = {
            name: key,
            value: text
        }
    });

    return found;
}
function loadUnitItems(JP, tmr, stmr) {
    
    var equipment = fs.readFileSync(`../ffbe${JP}/equipment.json`);
    var equipList = JSON.parse(equipment.toString());
    equipment = null;

    var TMR = equipList[tmr];
    var STMR = equipList[stmr];
    equipList = null;

    if (!TMR || !STMR) {
        var materia = fs.readFileSync(`../ffbe${JP}/materia.json`);
        var materiaList = JSON.parse(materia.toString());

        if (materiaList[tmr]) TMR = materiaList[tmr];
        if (materiaList[stmr]) STMR = materiaList[stmr];

        materia = null;
        materiaList = null;
    }

    return {
        TMR: TMR,
        STMR: STMR
    }
}
function equipToString(equip) {
    var effects = "";
    var slot = "";
    var stats = "";

    log(`Equip Name: ${equip.name}, Type: ${equip.type}`);

    if (equip.type == "EQUIP") {
        if (equip.effects) {
            equip.effects.forEach(effect => {
                if (!checkString(effect, /grants.*passive/i))
                    effects += `${effect}\n`;
            });
        }
        
        if (equip.stats) {
            var statKeys = Object.keys(equip.stats);
            statKeys.forEach(key => {
                const stat = equip.stats[key];
                if (!stat) return;

                if (constants.statParameters.includes(key.toLowerCase())) {
                    log(`${key}; ${stat}, `);
                    stats += `${key}: ${stat}, `;
                } else {
                    stats += `\n${key.replaceAll("_", " ").toTitleCase(" ")}:\n`;
                    var substatKeys = Object.keys(stat);
                    substatKeys.forEach(subkey => {
                        const sub = stat[subkey];
                        if (!sub) return;
            
                        log(`${subkey}; ${sub}, `);
                        stats += `${subkey}: ${sub}, `;
                    });
                }
            });
        }

        if (equip.skills) {
            var skillKeys = Object.keys(equip.skills);
            skillKeys.forEach(key => {
                const skill = equip.skills[key];
                if (!skill) return;

                skill.effects.forEach(eff => {
                    log(`${key}: ${eff}`);
                    effects += `${eff}\n`;
                });
            });
        }

        if (equip.slot === "Weapon")
            slot = constants.weaponList[equip.type_id-1].toTitleCase(" ");
        else
            slot = equip.slot;
    }
    
    if (equip.type == "MATERIA") {
        effects += `"*${equip.strings.desc_short[0]}"*\n`;
        slot = "Materia";
    }

    return {
        name: `${equip.name} - ${slot}`,
        value: `${stats}\n${effects}`
    }
}
function arrayToString(array) {
    let str = "";
    for (let index = 0; index < array.length; index++) {
        const element = array[index];
        let num = parseInt(element);

        if (index > 0) {
            let prev = parseInt(array[index-1]);
            num = num - prev;
            if (num > 0) {
                str += `-${num}`;
            }
        } else {
            str += `${element}`;
        }
    }

    var fam = "Orphans";
    var keys = Object.keys(chainFamilies);
    for (let ind = 0; ind < keys.length; ind++) {
        const key = keys[ind];
        if (chainFamilies[key] === str.trim()) {
            fam = `${key}`;
            break;
        }
    }
    return {str: str, fam: fam };
}


// COMMANDS

// WIKI 
function handleUnit(receivedMessage, search, parameters) {
    search = search.toTitleCase("_");
    log("Searching Units For: " + search);
    ffbe.queryWikiForUnit(search, parameters, function (pageName, imgurl, description, limited, fields) {
        pageName = pageName.replaceAll("_", " ");

        var embed = {
            color: pinkHexCode,
            thumbnail: {
                url: imgurl
            },
            title: pageName,
            url: "https://exvius.gamepedia.com/" + search,
            fields: fields,
            description ():string {
                return this.options["description"];
            },
            footer: {
                text: ""
            }
        };

        // TODO: Create a function to better wrap this since it will be common
        if (
            parameters.length == 0 ||
            (parameters.length > 0 && parameters.includes("Description"))
        ) {
            embed.description = description;
        }
        if (limited) {
            embed.footer = {
                text: "Unit Is Limited"
            };
        }

        Client.sendMessage(receivedMessage, embed);
    });
}
function handleEquip(receivedMessage, search, parameters) {
    search = search.toTitleCase("_");
    log(`Searching Equipment For: ${search}...`);
    ffbe.queryWikiForEquipment(search, parameters, function (imgurl, pageName, nodes) {
        var title = pageName;
        pageName = pageName.replaceAll(" ", "_");

        var embed = {
            color: pinkHexCode,
            thumbnail: {
                url: imgurl
            },
            title: title,
            fields: nodes,
            url: "https://exvius.gamepedia.com/" + pageName
        };

        Client.sendMessage(receivedMessage, embed);
    });
}
function handleSkill(receivedMessage, search, parameters) {

    search = search.toTitleCase("_");
    log(`Searching Skills For: ${search}...`);
    ffbe.queryWikiForAbility(search, parameters, function (imgurl, pageName, nodes) {
        var title = pageName;
        pageName = pageName.replaceAll(" ", "_");

        var embed = {
            color: pinkHexCode,
            thumbnail: {
                url: imgurl
            },
            title: title,
            fields: nodes,
            url: "https://exvius.gamepedia.com/" + pageName
        };

        Client.sendMessage(receivedMessage, embed);
    });
}
function handleSearch(receivedMessage, search) {
    log(`Searching For: ${search}...`);
    ffbe.queryWikiWithSearch(search, function (batch) {

        var embed = {
            color: pinkHexCode,
            fields: batch
        };

        Client.sendMessage(receivedMessage, embed);
    });
}
function handleRank(receivedMessage, search, parameters) {
    log("\nSearching Rankings for: " + search);

    if (search) {
        const unit = cache.getUnitRank(search.toLowerCase());
        if (!unit) {
            log("Could not find unit");
            return;
        }

        var embed = {
            title: unit.Unit,
            url: wikiEndpoint + unit.Unit.replaceAll(" ", "_"),
            color: pinkHexCode,
            fields: [
                {
                    name: "Rank",
                    value: `${unit.Base} - ${unit.TDH}`
                }
            ],
            thumbnail: {
                url: unit.imgurl
            }
        };

        if (unit.notes) {
            embed.fields[embed.fields.length] = {
                name: "Notes",
                value: unit.notes
            };
        }

        Client.sendMessageWithAuthor(receivedMessage, embed, muspelUserID);
        return;
    }

    /*
    var embeds = [];
    var rankings = config.getRankings(search);
    log("\nRankings");
    log(rankings);
    rankings.forEach(rank => {
        embeds[embeds.length] = {
            title: rank.name,
            url: rank.pageurl,
            color: pinkHexCode,
            fields: [
                {
                    name: rank.comparison,
                    value: rank.reason
                }
            ],
            thumbnail: {
                url: rank.imgurl
            }
        };
    });

    log("\nEmbeds");
    log(embeds);
    embeds.forEach(embed => {
        Client.sendMessageWithAuthor(receivedMessage, embed, furculaUserID);
    });
    */
}

function handleK(receivedMessage, search, id, name) {
    log(`handleKit(${search})`);

    var unit = getUnitData(id);
    if (!unit) {
        log(`Could not find unit data: ${unit}`);
        return;
    }
    
    var fields = null;
    var keyword = new RegExp(search.replace(/_/g,".*"), "i");
    if (checkString(search, /frames|chain/i)) {
        fields = searchUnitFrames(unit);
    } else if (checkString(search, /enhancement/i)) {
        fields = searchUnitSkills(unit, /\+2$|\+1$/i, undefined);
    } else if (checkString(search, /cd/i)) {
        log("SEARCHING FOR CD");
        fields = searchUnitSkills(unit, /one.*use.*every.*turns/i, undefined);
    } else {
        var items = searchUnitItems(unit, keyword);
        var skills = searchUnitSkills(unit, keyword, true);
        
        fields = skills.concat(items);
    }

    if (!fields || fields.length == 0) {
        log(`Failed to get unit skill list: ${keyword}`);
        return;
    }

    name = name.toTitleCase("_")
    var embed = {
        color: pinkHexCode,
        thumbnail: {
            url: sprite(getMaxRarity(id))
        },
        title: name.replaceAll("_", " "),
        url: "https://exvius.gamepedia.com/" + name,
        fields: fields
    };

    Client.sendMessage(receivedMessage, embed);
}

function handleKit(receivedMessage, search, parameters, active) {
    log(`handleKit(${search})`);

    var id = getUnitKey(search);
    if (!id) {
        log("No Unit Found");
        return;
    }

    var unit = getUnitData(id);
    if (!unit) {
        log(`Could not find unit data: ${unit}`);
        return;
    }

    var key = convertParametersToSkillSearch(parameters);
    var keyword = new RegExp(key.replace(/_/g,".*"), "gi");
    var fields = searchUnitSkills(unit, keyword, active);
    if (!fields || fields.length == 0) {
        log(`Failed to get unit skill list: ${keyword}`);
        return;
    }

    var name = unit.name.toTitleCase()
    log(`Unit Name: ${name}`);
    var embed = {
        color: pinkHexCode,
        thumbnail: {
             url: sprite(getMaxRarity(id))
        },
        title: name,
        url: "https://exvius.gamepedia.com/" + name.replaceAll(" ", "_"),
        fields: fields
    };

    Client.sendMessage(receivedMessage, embed);
}
function handleAbility(receivedMessage, search, parameters) {
    handleKit(receivedMessage, search, parameters, true);
}
function handlePassive(receivedMessage, search, parameters) {
    handleKit(receivedMessage, search, parameters, false);
}
function handleEnhancements(receivedMessage, search, parameters) {
    log(`handleKit(${search})`);

    var id = getUnitKey(search);
    if (!id) {
        log("No Unit Found");
        return;
    }

    var unit = getUnitData(id);
    if (!unit) {
        log(`Could not find unit data: ${unit}`);
        return;
    }
}

function handleData(receivedMessage, search, parameters) {
    
    search = search.replaceAll("_", " ");
    var data = cache.getSkill(search);
    if (!data) {
        log("Could not find Data for: " + search);
        return;
    }

    const defaultParameters = [ 
        'attack_count',
        'attack_damage',
        'attack_frames',
        'attack_type',
        'element_inflict',
        'effects',
    ]
    if (!parameters || parameters.length == 0)
        parameters = defaultParameters;
    
    const dataKeys = Object.keys(data);
    dataKeys.forEach(dkey => {
        var fields = [];
        const obj = data[dkey];

        const keys = Object.keys(obj);
        for (let ind = 0; ind < keys.length; ind++) {
            const key = keys[ind];
            const value = `${obj[key]}`;
            
            if (!parameters.includes(key))
                continue;
            if (!value || value.empty() || value === "null" || value === "None")
                continue;
            
            fields[fields.length] = {
                name: key,
                value: value
            }
        }
        
        var embed = <any>{
            title: `${dkey} - ${obj.name}`,
            color: pinkHexCode,
            fields: fields
        }
        
        Client.sendMessage(receivedMessage, embed);
    });
}

// FLUFF
function handleReactions(receivedMessage) {
    const content = receivedMessage.content.toLowerCase();
    switch (content) {
        case "hi majin":
            receivedMessage.guild.emojis.forEach(customEmoji => {
                if (
                    customEmoji.name === "nuked" ||
                    customEmoji.name === "tifapeek" ||
                    customEmoji.name === "think"
                ) {
                    receivedMessage.react(customEmoji);
                }
            });
            break;
        case "hi jake":
            receivedMessage.react("🌹");
            receivedMessage.react("🛋");
            break;
        case "hi reberta":
            receivedMessage.guild.emojis.forEach(customEmoji => {
                if (
                    customEmoji.name === "hugpweez" ||
                    customEmoji.name === "yay" ||
                    customEmoji.name === "praise"
                ) {
                    receivedMessage.react(customEmoji);
                }
            });
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
function handleGif(receivedMessage, search, parameters) {
    log("Searching gifs for: " + search);

    var bot = /^\d/.test(search)
    if (bot)
        search = search.toUpperCase();

    var title = search.toTitleCase("_");

    var param = parameters[0];
    if (gifAliases[param]) {
        param = gifAliases[param];
    }

    getGif(search, param, (filename) => {
        log("success");

        Client.sendImage(receivedMessage, filename);
    });
}
function handleSprite(receivedMessage, search, parameters) {

    var unit = getUnitKey(search);
    if (!unit) {
        return;
    }

    unit = getMaxRarity(unit)

    log("Searching Unit Sprite For: " + search);
    validateUnit(search, function (valid, imgurl) {
        search = search.replaceAll("_", " ");

        var embed = {
            color: pinkHexCode,
            image: {
                url: sprite(unit)
            }
        };

        Client.sendMessage(receivedMessage, embed);
    });
}

// INFORMATION
function handleRecentunits(receivedMessage, search, parameters) {

    ffbe.queryWikiFrontPage((links) => {
        var embed = {
            color: pinkHexCode,
            author: Client.getAuthorEmbed(),
            title: "Recently Released Units",
            description: links,
            url: "https://exvius.gamepedia.com/Unit_List"
        };

        Client.sendMessage(receivedMessage, embed);
    })
}
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

    Client.sendMessageWithAuthor(receivedMessage, embed, renaulteUserID);
}
function handleGuide(receivedMessage, search, parameters) {
    handleWhatis(receivedMessage, search, parameters);
}
function handleG(receivedMessage, search, parameters) {
    handleWhatis(receivedMessage, search, parameters);
}
function handleNoob(receivedMessage, search, parameters) {
    handleWhatis(receivedMessage, "new_player", parameters);
}
function handleGlbestunits(receivedMessage, search, parameters) {

    const guildId = receivedMessage.guild.id;
    const settings = cache.getRankings("bestunits");

    var list = "";
    Object.keys(settings).forEach((v) => {

        var units = settings[v].split(" / ");
        var links = `**${v}:** `;
        units.forEach((u, ind) => {
            //log(u);
            u = convertSearchTerm(u);
            u = convertValueToLink(u);
            links += u;
            if (ind < 2) {
                links += "/ ";
            }
        });

        list += "\n" + links;
    });

    var embed = {
        color: pinkHexCode,
        title: `Global Best 7★ Units (random order, limited units __excluded__)`,
        description: list,
    };

    Client.sendMessageWithAuthor(receivedMessage, embed, renaulteUserID);
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

// DAMAGE
function handleDpt(receivedMessage, search, parameters, isBurst) {

    search = search.replaceAll("_", " ");
    var calc = cache.getCalculations(search, isBurst);
    if (!calc) {
        log("Could not find calculations for: " + search);
        return;
    }

    var text = "";
    var limit = 5;
    if (parameters && parameters[0])
        limit = parameters[0];
        
    const keys = Object.keys(calc);
    const cap = Math.min(limit, keys.length);
    for (let ind = 0; ind < cap; ind++) {
        const key = keys[ind];
        const element = calc[key];

        if (isBurst) {
            text += `**${element.name}:** ${element.damage} on turn ${element.turns}\n`;
        } else {
            text += `**${element.name}:** ${element.damage} : ${element.turns}\n`;
        }
    }

    var title = "";
    var s = search.toTitleCase();
    if (isBurst) {
        title = `Burst damage for: ${s}. (damage on turn)`;
    } else {
        title = `DPT for: ${s}. (dpt - turns for rotation)`;
    }

    var embed = <any>{
        color: pinkHexCode,
        title: title,
        url: "https://docs.google.com/spreadsheets/d/1cPQPPjOVZ1dQqLHX6nICOtMmI1bnlDnei9kDU4xaww0/edit#gid=0",
        description: text,
        footer: {
            text: "visit the link provided for more calculations"
        },
    }
    
    Client.sendMessageWithAuthor(receivedMessage, embed, furculaUserID);
}
function handleBurst(receivedMessage, search, parameters) {
    handleDpt(receivedMessage, search, parameters, true);
}


// ADDING RESOURCES
function handleAddalias(receivedMessage, search, parameters) {
    if (receivedMessage.content.replace(/[^"]/g, "").length < 4) {
        log("Invalid Alias");
        return;
    }

    var w1 = parameters[0];
    var w2 = parameters[1];

    validateUnit(w1, valid => {
        if (valid) {
            respondFailure(receivedMessage);
        } else {
            validateUnit(w2, valid => {
                if (valid) {
                    log("Unit is valid");

                    w1 = w1.replaceAll(" ", "_");
                    config.setAlias(w1, w2);
                    config.save();

                    respondSuccess(receivedMessage);
                } else {
                    respondFailure(receivedMessage);
                }
            });
        }
    });
}
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
                                    if (customEmoji.name === config.getSuccess(guildId)) {
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

    if (config.validateEditor(guildId(receivedMessage), userId(receivedMessage))) {
        log("User is not an editor");
        return;
    }

    if (config.setShortcut(guildId(receivedMessage), search, command)) {
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
function handleSetrankings(receivedMessage, search, parameters) {
    if (receivedMessage.guild) {
        return;
    }

    var value = parameters[0];
    search = search.replaceAll("_", " ");
    search = search.toTitleCase();
    search = `[${search}]`;
    
    log("Set Rankings");
    log(`Catergory: ${search}`);
    log(`Value: ${value}`);

    if (cache.setRankings(search, value)) {
        respondSuccess(receivedMessage, true);
    } else {
        respondFailure(receivedMessage, true);
    }
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

    if (cache.setInformation(search, title, desc)) {
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

    if (cache.setInformation(search, "title", "desc")) {
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

        config.setPrefix(receivedMessage.guild.id, s[1]);
        config.save();
        config.init();

        respondSuccess(receivedMessage);
    }
}
function handleUpdate(receivedMessage, search, parameters) {

    if (!Client.isAuthorized(receivedMessage.author)) {
        return;
    }

    log("Handle Update");

    try {
        cache.updateDamage();
    } catch(e) {
        log(e);
        respondFailure(receivedMessage, true);
    }

    log("Finished Updating");
    respondSuccess(receivedMessage, true);
}
function handleReload(receivedMessage, search, parameters) {

    var id = receivedMessage.author.id;
    if (id != renaulteUserID && id != jimooriUserID && id != furculaUserID) {
        return;
    }

    log("Handle Reload");

    try {
        cache.reload();
        config.reload();
    } catch(e) {
        log(e);
        respondFailure(receivedMessage, true);
    }

    log("Finished Reloading");
    respondSuccess(receivedMessage, true);
}


// COMMANDS END


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

// IMAGES



var unitsDump = null;
function getUnitKey(search) {
    if (unitsDump === null) {
        log("loading units list")
        var data = fs.readFileSync("data/unitkeys.json");
        unitsDump = JSON.parse(String(data));
    }

    if (!unitsDump[search]) {
        return null
    }

    return unitsDump[search];
}
function isLetter(str) {
    return str.length === 1 && str.match(/[a-z]/i);
}
function getMaxRarity(unit) {
    var rarity = unit[unit.length-1];
    var id = unit.substring(0, unit.length-1);
    log("Unit ID: " + unit);
    if (rarity === "5") {
        unit = id + "7";
    }
    return unit;
}


function getGif(search, param, callback) {
    log("getGif: " + search + `(${param})`);
    
    const filename = `tempgifs/${search}/${param}.gif`;
    if (fs.existsSync(filename)) {
        callback(filename);
        log("Returning cached gif");
        return;
    }

    var unit = getUnitKey(search);
    if (!unit)
        unit = search;

    

    var rarity = unit[unit.length-1];
    var id = unit.substring(0, unit.length-1);
    log("Unit ID: " + unit);
    
    var unitL = null; // ignore using othet source if JP
    if (isLetter(search[0])) {
        unitL = search.replaceAll("_", "+");
    }
    
    var gifs = [];
    var count = 5; // most units only have 2 pages
    var queryEnd = function (c) {
        count--;

        if (count <= 0) {

            gifs.sort((a, b) => {
                if(a.includes("ffbegif"))
                    return -1;
                else 
                    return 1;
            });
            log(gifs);
            
            var img = gifs.find((n) => {
                n = n.toLowerCase();

                if (param.includes("win")) {
                    return n.includes(param) && !n.includes("before");
                }

                log(`Compare Gifs: ${n}, ${param}`);

                // magic has priority
                if (compareStrings(n, "limit") || compareStrings(param, "limit")) {
                    log(`Found Limit: param: ${compareStrings(param, "limit")}, n to param: ${compareStrings(n, param)}`);
                    return compareStrings(param, "limit") && compareStrings(n, param);
                } else if ((compareStrings(n, "mag") && !compareStrings(n, "standby")) ||
                            (compareStrings(param, "mag") && !compareStrings(param, "standby"))) {
                    log(`Found mag: param: ${compareStrings(param, "mag")}, n to param: ${compareStrings(n, param)}`);
                    return compareStrings(n, param) && compareStrings(param, "mag") && !compareStrings(n, "standby");
                } else if (compareStrings(n, "standby")) {
                    log(`Found Standby: param: ${compareStrings(param, "magic")}, n: ${compareStrings(n, "magic")}`);

                    return compareStrings(param, "standby") 
                            && ((!compareStrings(param, "magic") && !compareStrings(n, "magic"))
                            || (compareStrings(param, "magic") && compareStrings(n, "magic")));
                } else if (compareStrings(n, "atk|attack") && compareStrings(param, "atk|attack")) {
                    log(`Found Atk: param: ${compareStrings(param, "atk")}, n: ${compareStrings(n, "atk")}`);
                    log(`Found Attack: param: ${compareStrings(param, "attack")}, n: ${compareStrings(n, "attack")}`);
                    return true;
                }
                
                log("Gif did not match any cases");
                return compareStrings(n, param);
            });
            if (!img) {
                img = gifs.find((n) => {
                    return n.toLowerCase().replaceAll(" ", "_").includes(param.replaceAll(" ", "_"));
                });
            }
            if (img) {
                
                img = img.replaceAll(" ", "%20");
                log("Found Requested Gif");
                log(img);
                
                if (!fs.existsSync(`tempgifs/${search}/`))
                    fs.mkdirSync( `tempgifs/${search}/`, { recursive: true});
                    
                var file = null;
                var source = img.slice(0, 5) === 'https' ? https : http;
                source.get(img, function(response) {
                    if (response.statusCode !== 200) {
                        log("Unit Animation not found");
                        return;
                    }
                    file = fs.createWriteStream(filename);
                    file.on('finish', function() {
                        callback(filename);
                    });
                    return response.pipe(file);
                });
            }
        }
    };

    var uri = [ aniGL(unit), aniJP(unit) ];
    for(var i = 0; i < 2; i++) {
        request(
            { uri: uri[i] },
            function(error, response, body) {
                const $ = cheerio.load(body);
                $('img').each((ind, el) => {
                    var src = $(el).attr('src');
                    if (src === undefined)
                        return;

                    var ext = getFileExtension(src);
                    if (ext === ".gif") {
                        gifs.push(src);
                    }
                });

                queryEnd(count);
            }
        );
    }

    if (unitL) {
        for(var i = 0; i < 2; i++) {
            request(
                { uri: `${ffbegifEndpoint}?page=${i}&name=${unitL}` },
                function(error, response, body) {
                    const $ = cheerio.load(body);
                    $('img').each((ind, el) => {
                        var src = $(el).attr('src');
                        if (src === undefined)
                            return;

                        /*if (rarity === "5") {
                            if (!src.includes(id + "7")){
                                return;
                            }
                        }*/

                        //log(`SRC: ${src}`);
                        if (src.includes("Move")) return;

                        var ext = getFileExtension(src);
                        if (ext === ".gif") {
                            gifs.push(ffbegifEndpoint+src);
                        }
                    });

                    queryEnd(count);
                }
            );
        }
    } else {
        count -= 2;
    }

    queryEnd(count);
}

// Validation
function validateUnit(search, callback) {
    log(`validateUnit(${search})`);
    var unit = getUnitKey(search.replaceAll(" ", "_"));
    log(unit);
    callback(unit != null);
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

// Response
function respondSuccess(receivedMessage, toUser = false) {
    Client.respondSuccess(receivedMessage, toUser);
}
function respondFailure(receivedMessage, toUser = false) {
    Client.respondFailure(receivedMessage, toUser);
}

function convertCommand(command, content, prefix) {

    //log("Convert Command");
    //log(command);
    //log("\n");

    // TODO: make this more robust.
    if (command === "Family") {
        return {
            command: "Unit",
            parameters: ["chain" ],
            content: content.replace("family", "unit") + ` "chain"`
        };
    } else if (command === "Damage") {
        return {
            command: "Dpt",
            parameters: ["chain" ],
            content: content.replace(`${prefix}damage`, `${prefix}dpt`)
        };
    }

    return null;
}
function runCommand(receivedMessage) {
    
}

function unitQuery(receivedMessage, command, search) {
    if (!command)
        return false;

    //log(`${command} Doesn't Exists`);
    var s = command.toLowerCase();
    //log(`Search: ${search}`);

    var alias = config.getAlias(s);
    if (alias) {
        //log("Found Alias: " + alias);
        command = alias.toLowerCase().replaceAll(" ", "_");
    }

    var id = getUnitKey(command.toLowerCase())
    //log(`Unit ID: ${id}`);
    if (!id)
        return false;

    //log(`Unit ID valid`);
    if (search && !search.empty()) {
        log(search);
        search = escapeString(search);
        log(search);
        searchAliases.forEach(regex => {
            if (checkString(search, regex.reg)) {
                //log(`Search contains a word to replace`);
                search = search.replace(regex.reg, regex.value);
                //log(`New Search: ${search}`);
            }
        });
        search = search.replaceAll(" ",".*")
    } else {
        search = unitDefaultSearch;
    }

    handleK(receivedMessage, search, id, command);
    return true;
}


// HELPERS
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
function overwriteFile(existing, url, callback) {
    fs.unlink(existing, err => {
        if (err) {
            log(err);
            return;
        }

        downloadFile(name, url, result => {
            log(result);

            callback(result);
            
        });
    });
}
function downloadFile(name, link, callback) {
    var ext = link.substring(link.lastIndexOf("."), link.length);
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

// PARSING HELPERS
function convertSearchTerm(search) {
    var s = search;
    var alias = config.getAlias(s.replaceAll(" ", "_"));
    if (alias) {
        log("Found Alias: " + alias);
        return alias.replaceAll(" ", "_");
    }

    //search = search.toLowerCase();
    search = search.replaceAll(" ", "_");
    return search;
}
function convertParametersToSkillSearch(parameters) {
    var search = "";
    parameters.forEach((param, ind) => {
        if (ind > 0) 
            search += "|";
        search += param;
    });

    searchAliases.forEach(regex => {
        if (checkString(search, regex.reg)) {
            //log(`Search contains a word to replace`);
            search = search.replace(regex.reg, regex.value);
            //log(`New Search: ${search}`);
        }
    });

    return search.replaceAll(" ",".*")
}
function getSearchString(prefix, msg, replace = true) {
    var ind = prefix.length + 1;
    var search = msg.slice(ind, msg.length);

    if (search.empty()) {
        return null;
    }

    if (replace == undefined || replace) { 
        var s = search;
        var alias = config.getAlias(s.replaceAll(" ", "_"));
        if (alias) {
            log("Found Alias: " + alias);
            return alias.replaceAll(" ", "_");
        }
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
