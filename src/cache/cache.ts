//////////////////////////////////////////
// Author: Dahmitri Stephenson
// Discord: Jimoori#2006
// Jimbot: Discord Bot
//////////////////////////////////////////

import * as fs from "fs";
import "../string/string-extension.js";

const infoJson = 'data/information.json';

export class Cache {
    information: any;
    constructor() {
        this.init();
    }

    init() {
        this.reload();
    }
    saveInformation() {
        var newData = JSON.stringify(this.information, null, "\t");
        fs.writeFileSync(infoJson, newData);
    }

    reload() {
        console.log("Reloading Cached Data");
        this.information = JSON.parse(fs.readFileSync(infoJson).toString());
    }


    // Information
    setInformation(name: string, title: string, data: any, author: string) {
        if (this.information.aliases[name]) {
            name = this.information.aliases[name];
        }

        this.information[name] = {
            author: author,
            title: title,
            description: data
        } 
        this.saveInformation();
        return true;
    }
    getInformation(name: string)  {
        if (this.information.aliases[name]) {
            name = this.information.aliases[name];
        }

        if (this.information[name]) {
            return this.information[name];
        }
        return null;
    }
    
};

export const cache = new Cache();