//////////////////////////////////////////
// Author: Dahmitri Stephenson
// Discord: Jimoori#2006
// Jimbot: Discord Bot
//////////////////////////////////////////


const fs = require('fs');
import "../string/string-extension.js";
const filename = './config/config.json';

export class Config {
    configuration: any;
    constructor() {
        this.init();
    }

    init() {
        var data = fs.readFileSync(filename);
        this.configuration = JSON.parse(data);
    }
    save() {
        var newData = JSON.stringify(this.configuration, null, "\t");
        fs.writeFileSync(filename, newData);
    }
    
    reload() {
        var data = fs.readFileSync(filename);
        this.configuration = JSON.parse(data);
    }

    filetypes() {
        return this.configuration.filetypes;
    }

    // COMMAND ALIASES
    getCommandAlias(name: string) {
        name = name.toLowerCase();
        console.log(`Searching For Command Alias: ${name}`);
        if (!this.configuration.commandAliases || !this.configuration.commandAliases[name])
            return null;
            
        console.log(`Found Command Alias: ${this.configuration.commandAliases[name]}`);
        return this.configuration.commandAliases[name];
    }
    setCommandAlias(name: string, command: string) {
        name = name.toLowerCase().replaceAll(" ", "_");

        this.configuration.commandAliases[name] = command;
        this.save();
        return true;
    }

    // SHORTCUTS
    getShortcut(name: string) {
        name = name.toLowerCase();
        console.log(`Searching For Shortcut: ${name}`);
        if (!this.configuration.shortcuts || !this.configuration.shortcuts[name])
            return null;
            
        console.log(`Found Shortcut: ${this.configuration.shortcuts[name]}`);
        return this.configuration.shortcuts[name];
    }
    setShortcut(name: string, command: string) {
        name = name.toLowerCase();

        if (!this.configuration[`shortcuts`]) {
            this.configuration[`shortcuts`] = {}
        }

        this.configuration.shortcuts[name] = command;
        this.save();
        return true;
    }

};

export const config = new Config();