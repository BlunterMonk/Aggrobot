//////////////////////////////////////////
// Author: Dahmitri Stephenson
// Discord: Jimoori#2006
// Jimbot: Discord Bot
//////////////////////////////////////////


const fs = require('fs');
import "../string/string-extension.js";
const filename = './data/profiles.json';

export class Profile {
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

    // ALIASES
    getProfile(name: string) {
        if (this.configuration[name]) {
            return this.configuration[name];
        } else {
            return null;
        }
    }
    
    addProfile(name: string, value: any) {
        this.configuration[name] = value;
    }

    setProfileField(name: string, field: string, value: any) {
        if (!this.configuration[name])
            return;
            
        this.configuration[name][field.toLowerCase()] = value;
        this.save()
    }
    getProfileField(name: string, field: string) {
        if (!this.configuration[name])
            return;
            
        return this.configuration[name][field.toLowerCase()];
    }

};

export const profiles = new Profile();