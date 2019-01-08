var exports = exports || {};
var module = module || { exports: exports };
var discord;
(function (discord) {
    /** Get the title for the webhooks */
    function getTitle(phase) {
        var defaultVal = "__**Territory Battle: Phase " + phase + "**__";
        return "" + config.discord.webhookTemplate(phase, WEBHOOK_TITLE_ROW, defaultVal);
    }
    discord.getTitle = getTitle;
    /** Get the formatted zone name with location descriptor */
    function getZoneName(phase, zoneNum, full) {
        var zone = SPREADSHEET.getSheetByName(SHEETS.PLATOONS)
            .getRange((zoneNum * PLATOON_ZONE_ROW_OFFSET) + 4, 1)
            .getValue();
        var loc;
        switch (zoneNum) {
            case 0:
                loc = '(Top)';
                break;
            case 2:
                loc = '(Bottom)';
                break;
            case 1:
            default:
                loc = (phase === 2) ? '(Top)' : '(Middle)';
        }
        var result = (full && phase !== 1)
            ? zone + " " + loc + " " + (zoneNum === 0 ? 'Squadrons' : 'Platoons')
            : loc + " " + zone;
        return result;
    }
    discord.getZoneName = getZoneName;
    /** Get a string representing the platoon assignements */
    function getPlatoonString(platoon) {
        var results = [];
        // cycle through the heroes
        for (var h = 0; h < MAX_PLATOON_UNITS; h += 1) {
            if (platoon[h][1].length === 0 || platoon[h][1] === 'Skip') {
                // impossible platoon
                return undefined;
            }
            // remove the gear
            var name = platoon[h][1];
            var endIdx = name.indexOf(' (');
            if (endIdx > -1) {
                name = name.substring(0, endIdx);
            }
            // add the assignement
            results.push("**" + platoon[h][0] + "**: " + name);
        }
        return results.join('\n');
    }
    discord.getPlatoonString = getPlatoonString;
    /** Get the member Discord IDs for mentions */
    function getMemberMentions() {
        var sheet = SPREADSHEET.getSheetByName(SHEETS.DISCORD);
        var data = sheet.getRange(2, 1, sheet.getLastRow(), 2)
            .getValues();
        var result = {};
        for (var _i = 0, data_1 = data; _i < data_1.length; _i++) {
            var e = data_1[_i];
            var name = e[0];
            // only stores unique names, we can't differentiate with duplicates
            if (name && name.length > 0 && !result[name]) {
                // store the ID if it exists, otherwise store the member's name
                result[name] = (e[1] && e[1].length > 0) ? e[1] : name;
            }
        }
        return result;
    }
    discord.getMemberMentions = getMemberMentions;
    /** Get an array representing the new platoon assignements */
    function getPlatoonDonations(platoon, donations, rules, memberMentions) {
        var result = [];
        var _loop_1 = function (h) {
            if (platoon[h][0].length === 0) {
                return "continue";
            }
            if (platoon[h][1].length === 0 || platoon[h][1] === 'Skip') {
                return { value: undefined };
            }
            // see if the hero is already in donations
            var heroDonated = donations.some(function (e) { return e[0] === platoon[h][0]; })
                || result.some(function (e) { return e[0] === platoon[h][0]; });
            if (!heroDonated) {
                var criteria = rules[h][0].getCriteriaValues();
                // only add rare donations
                if (criteria[0].length < RARE_MAX) {
                    var sorted = criteria[0].sort(caseInsensitive_);
                    var names = [];
                    for (var _i = 0, sorted_1 = sorted; _i < sorted_1.length; _i++) {
                        var name = sorted_1[_i];
                        var mention = memberMentions[name];
                        names.push(mention ? name + " (" + mention + ")" : "" + name);
                    }
                    // add the recommendations
                    result.push([platoon[h][0], names.join(', ')]);
                }
            }
        };
        // cycle through the heroes
        for (var h = 0; h < MAX_PLATOON_UNITS; h += 1) {
            var state_1 = _loop_1(h);
            if (typeof state_1 === "object")
                return state_1.value;
        }
        return result;
    }
    /** Get the intro for the depth webhook */
    function getDepthIntro(phase, mention) {
        var defaultVal = "Here are the Platoon assignments for __Phase " + phase + "__.\n  **Do not donate heroes to the other Platoons.**";
        return "\n\n" + config.discord.webhookTemplate(phase, WEBHOOK_DEPTH_ROW, defaultVal) + " " + mention;
    }
    discord.getDepthIntro = getDepthIntro;
    /** Get the intro for the rare by webhook */
    function getRareIntro(phase, mention) {
        var defaultVal = "Here are the Safe Platoons and the Rare Platoon donations for __Phase " + phase + "__.\n  **Do not donate heroes to the other Platoons.**";
        return "\n\n" + config.discord.webhookTemplate(phase, WEBHOOK_RARE_ROW, defaultVal) + " " + mention;
    }
    /** Get the intro for the warning webhook */
    function getWarnIntro(phase, mention) {
        var defaultVal = "Here are the __Rare Units__ to watch out for in __Phase " + phase + "__.\n  **Check with an officer before donating to Platoons/Squadrons that require them.**";
        return "\n\n" + config.discord.webhookTemplate(phase, WEBHOOK_WARN_ROW, defaultVal) + " " + mention;
    }
    discord.getWarnIntro = getWarnIntro;
    /** Send the message to Discord */
    function postMessage(webhookURL, message) {
        var options = urlFetchMakeParam_({ content: message.trim() });
        urlFetchExecute_(webhookURL, options);
    }
    function messageSpooler(webhookURL, byType, donations) {
        var typeIsUnit = byType === 'Unit';
        var maxUrlLen = 1000;
        var maxCount = typeIsUnit ? 5 : 10;
        var acc = donations.reduce(function (acc, e) {
            if (e[1].length > 0) {
                var f = typeIsUnit ? e[0] + " (Rare)" : e[0];
                var s = "**" + f + "**\n" + e[1] + "\n\n";
                acc.count += s.length;
                acc.fields.push(s);
                // make sure our message isn't getting too long
                if (acc.fields.length >= maxCount || acc.count > maxUrlLen) {
                    postMessage(webhookURL, acc.fields.join(''));
                    acc.count = 0;
                    acc.fields = [];
                }
            }
            return acc;
        }, {
            count: 0,
            fields: []
        });
        if (acc.fields.length > 0) {
            postMessage(webhookURL, acc.fields.join(''));
        }
    }
    /** Send a Webhook to Discord */
    function sendPlatoonSimplified(byType) {
        var sheet = SPREADSHEET.getSheetByName(SHEETS.PLATOONS);
        var phase = config.currentPhase();
        // get the webhook
        var webhookURL = config.discord.webhookUrl();
        if (webhookURL.length === 0) { // we need a url to proceed
            var UI = SpreadsheetApp.getUi();
            UI.alert('Configuration Error', 'Discord webhook not found (Discord!E1)', UI.ButtonSet.OK);
            return;
        }
        // mentions only works if you get the ID
        // on your Discord server, type: \@rolename, copy the value <@#######>
        var memberMentions = getMemberMentions();
        var mentions = config.discord.roleId();
        var descriptionText = "" + discord.getTitle(phase) + getRareIntro(phase, mentions);
        // get data from the platoons
        var fields = [];
        var donations = [];
        var groundStart = -1;
        for (var z = 0; z < MAX_PLATOON_ZONES; z += 1) { // for each zone
            var platoonRow = (z * PLATOON_ZONE_ROW_OFFSET + 2);
            var validPlatoons = [];
            var zone = discord.getZoneName(phase, z, true);
            if (z === 1) {
                groundStart = donations.length;
            }
            if (z !== 0 || phase > 2) {
                // cycle throught the platoons in a zone
                for (var p = 0; p < MAX_PLATOONS; p += 1) {
                    var platoonData = sheet.getRange(platoonRow, (p * 4) + 4, MAX_PLATOON_UNITS, 2)
                        .getValues();
                    var rules = sheet.getRange(platoonRow, (p * 4) + 5, MAX_PLATOON_UNITS, 1)
                        .getDataValidations();
                    var platoon = getPlatoonDonations(platoonData, donations, rules, memberMentions);
                    if (platoon) {
                        validPlatoons.push(p);
                        if (platoon.length > 0) {
                            // add the new donations to the list
                            for (var _i = 0, platoon_1 = platoon; _i < platoon_1.length; _i++) {
                                var e = platoon_1[_i];
                                donations.push([e[0], e[1]]);
                            }
                        }
                    }
                }
            }
            // see if all platoons are valid
            var platoons = void 0;
            if (validPlatoons.length === MAX_PLATOONS) {
                platoons = 'All';
            }
            else {
                platoons = validPlatoons.map(function (e) { return "#" + (e + 1); }).join(', ');
            }
            // format the needed platoons
            if (validPlatoons.length > 0) {
                fields.push("**" + zone + "**\n" + platoons);
            }
        }
        // format the high needed units
        var heroesTable = new Units.Heroes();
        var highNeedShips = heroesTable.getHighNeedList();
        if (highNeedShips.length > 0) {
            fields.push("**High Need Ships**\n" + highNeedShips.join(', '));
        }
        var shipsTable = new Units.Ships;
        var highNeedHeroes = shipsTable.getHighNeedList();
        if (highNeedHeroes.length > 0) {
            fields.push("**High Need Heroes**\n" + highNeedHeroes.join(', '));
        }
        postMessage(webhookURL, descriptionText + "\n\n" + fields.join('\n\n') + "\n");
        // reformat the output if we need by member istead of by unit
        if (byType === 'Player') {
            var heroLabel_1 = 'Heroes: ';
            var shipLabel_1 = 'Ships: ';
            var acc = donations.reduce(function (acc, e, i) {
                var unit = e[0];
                var names = e[1].split(',');
                var _loop_2 = function (name) {
                    var nameTrim = name.trim();
                    // see if the name is already listed
                    var foundName = acc.some(function (member) {
                        var found = member[0] === nameTrim;
                        if (found) {
                            member[1] += (i >= groundStart && member[1].indexOf(heroLabel_1) < 0)
                                ? "\n" + heroLabel_1 + unit
                                : ", " + unit;
                        }
                        return found;
                    });
                    if (!foundName) {
                        acc.push([
                            nameTrim,
                            (i >= groundStart ? heroLabel_1 : shipLabel_1) + unit,
                        ]);
                    }
                };
                for (var _i = 0, names_1 = names; _i < names_1.length; _i++) {
                    var name = names_1[_i];
                    _loop_2(name);
                }
                return acc;
            }, []);
            // sort by member
            donations = acc.sort(function (a, b) { return caseInsensitive_(a[0], b[0]); });
        }
        // format the needed donations
        messageSpooler(webhookURL, byType, donations);
    }
    discord.sendPlatoonSimplified = sendPlatoonSimplified;
    // ****************************************
    // Timer Functions
    // ****************************************
    /** Figure out what phase the TB is in */
    function setCurrentPhase() {
        // get the guild's TB start date/time and phase length in hours
        var startTime = config.discord.startTime();
        var phaseHours = config.discord.phaseDuration();
        if (startTime && phaseHours) {
            var msPerHour = 1000 * 60 * 60;
            var now = new Date();
            var diff = now.getTime() - startTime.getTime();
            var hours = diff / msPerHour + 1; // add 1 hour to ensure we are in the next phase
            var phase = Math.ceil(hours / phaseHours);
            var maxPhases = 6;
            // set the phase in Platoons tab
            if (phase <= maxPhases) {
                SPREADSHEET.getSheetByName(SHEETS.PLATOONS)
                    .getRange(2, 1)
                    .setValue(phase);
            }
        }
    }
    discord.setCurrentPhase = setCurrentPhase;
})(discord || (discord = {}));
/** Send a Webhook to Discord */
function sendPlatoonDepthWebhook() {
    var sheet = SPREADSHEET.getSheetByName(SHEETS.PLATOONS);
    var phase = config.currentPhase();
    // get the webhook
    var webhookURL = config.discord.webhookUrl();
    if (webhookURL.length === 0) {
        // we need a url to proceed
        var UI = SpreadsheetApp.getUi();
        UI.alert('Configuration Error', 'Discord webhook not found (Discord!E1)', UI.ButtonSet.OK);
        return;
    }
    // mentions only works if you get the id
    // in Settings - Appearance - Enable Developer Mode, type: \@rolename, copy the value <@$####>
    var descriptionText = "" + discord.getTitle(phase) + discord.getDepthIntro(phase, config.discord.roleId());
    // get data from the platoons
    var fields = [];
    for (var z = 0; z < MAX_PLATOON_ZONES; z += 1) {
        if (z === 0 && phase < 3) {
            continue; // skip this zone
        }
        // for each zone
        var platoonRow = (z * PLATOON_ZONE_ROW_OFFSET) + 2;
        var zone = discord.getZoneName(phase, z, false);
        // cycle throught the platoons in a zone
        for (var p = 0; p < MAX_PLATOONS; p += 1) {
            var platoonData = sheet.getRange(platoonRow, (p * 4) + 4, MAX_PLATOON_UNITS, 2)
                .getValues();
            var platoon = discord.getPlatoonString(platoonData);
            if (platoon && platoon.length > 0) {
                fields.push({
                    name: zone + ": #" + (p + 1),
                    value: platoon,
                    inline: true
                });
            }
        }
    }
    var options = urlFetchMakeParam_({
        content: descriptionText,
        embeds: [{ fields: fields }]
    });
    urlFetchExecute_(webhookURL, options);
}
/** Send a Webhook to Discord */
function sendPlatoonSimplifiedByUnitWebhook() {
    discord.sendPlatoonSimplified('Unit');
}
/** Send a Webhook to Discord */
function sendPlatoonSimplifiedByMemberWebhook() {
    discord.sendPlatoonSimplified('Player');
}
/** Send a message to Discord that lists all units to watch out for in the current phase */
function allRareUnitsWebhook() {
    var phase = config.currentPhase();
    var webhookURL = config.discord.webhookUrl(); // get the webhook
    if (webhookURL.length === 0) {
        // we need a url to proceed
        var UI = SpreadsheetApp.getUi();
        UI.alert('Configuration Error', 'Discord webhook not found (Discord!E1)', UI.ButtonSet.OK);
        return;
    }
    var fields = [];
    // TODO: regroup phases and zones management
    if (phase >= 3) {
        // get the ships list
        var shipsTable = new Units.Ships();
        var ships = shipsTable.getNeededRareList(phase);
        if (ships.length > 0) {
            fields.push({
                name: 'Rare Ships',
                value: ships.join('\n'),
                inline: true
            });
        }
    }
    // get the hero list
    var heroesTable = new Units.Heroes();
    var heroes = heroesTable.getNeededRareList(phase);
    if (heroes.length > 0) {
        fields.push({
            name: 'Rare Heroes',
            value: heroes.join('\n'),
            inline: true
        });
    }
    // make sure we're not trying to send empty data
    if (fields.length === 0) {
        // no data to send
        fields.push({
            name: 'Rare Heroes',
            value: 'There Are No Rare Units For This Phase.',
            inline: true
        });
    }
    var title = discord.getTitle(phase);
    // mentions only works if you get the id
    // in Discord: Settings - Appearance - Enable Developer Mode
    // type: \@rolename, copy the value <@$####>
    var mentions = config.discord.roleId();
    var warnIntro = discord.getWarnIntro(phase, mentions);
    var desc = config.discord.webhookDescription(phase);
    var options = urlFetchMakeParam_({
        content: "" + title + warnIntro + desc,
        embeds: [{ fields: fields }]
    });
    urlFetchExecute_(webhookURL, options);
}
/** Callback function to see if we should send the webhook */
function sendTimedWebhook() {
    discord.setCurrentPhase(); // set the current phase based on time
    // reset the platoons if clear flag was set
    if (config.discord.resetPlatoons()) {
        resetPlatoons();
    }
    allRareUnitsWebhook(); // call the webhook
    registerWebhookTimer(); // register the next timer
}
/** Try to create a webhook trigger */
function registerWebhookTimer() {
    // get the guild's TB start date/time and phase length in hours
    var startTime = config.discord.startTime();
    var phaseHours = config.discord.phaseDuration();
    if (startTime && phaseHours) {
        var msPerHour = 1000 * 60 * 60;
        var phaseMs = phaseHours * msPerHour;
        var target = new Date(startTime);
        var now = new Date();
        var maxPhases = 6;
        // remove the trigger
        var triggers = ScriptApp.getProjectTriggers()
            .filter(function (e) { return e.getHandlerFunction() === sendTimedWebhook.name; });
        for (var _i = 0, triggers_1 = triggers; _i < triggers_1.length; _i++) {
            var trigger = triggers_1[_i];
            ScriptApp.deleteTrigger(trigger);
        }
        // see if we can set the trigger later in the phase
        for (var i = 2; i <= maxPhases; i += 1) {
            target.setTime(target.getTime() + phaseMs);
            if (target > now) {
                // target is in the future
                // found the start of the next phase, so set the timer
                ScriptApp.newTrigger(sendTimedWebhook.name)
                    .timeBased()
                    .at(target)
                    .create();
                break;
            }
        }
    }
}
