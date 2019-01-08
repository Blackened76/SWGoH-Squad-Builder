var exports = exports || {};
var module = module || { exports: exports };
// ****************************************
// Micromanaged Webhook Functions
// ****************************************
/** add discord mention to the member label */
function memberLabel_(member, mention) {
    var value = (mention)
        ? "Assignments for **" + member + "** (" + mention + ")"
        : "Assignments for **" + member + "**";
    return value;
}
/** output platoon numner as discord icon */
function platoonAsIcon_(label, type, platoon) {
    var platoonIcon = [':one:', ':two:', ':three:', ':four:', ':five:', ':six:'][platoon];
    return "__" + label + "__ \u00B7 " + type + " " + platoonIcon;
}
/** check if the unit can be difficult to identify */
function isUnitHardToRead_(unit) {
    return unit.search(/X-wing|U-wing|ARC-170|Geonosian|CC-|CT-|Dathcha|Jawa|Hoth Rebel/) > -1;
}
/** convert an array index to uhman friendly string (0 => '1') */
function arrayIndexToString_(index) {
    return (parseInt(index, 10) + 1).toString();
}
/** format the unit name */
function unitLabel_(unit, slot, force) {
    if (force === void 0) { force = undefined; }
    if (force || isUnitHardToRead_(unit)) {
        return "[slot " + arrayIndexToString_(slot) + "] " + unit;
    }
    return unit;
}
/** Send a Webhook to Discord */
function sendMicroByMemberWebhook() {
    var displaySetting = config.discord.displaySlots();
    var displaySlot = displaySetting !== DISPLAYSLOT.NEVER;
    var forceDisplay = displaySetting === DISPLAYSLOT.ALWAYS;
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
    // get data from the platoons
    var entries = [];
    var _loop_1 = function (z) {
        if (z === 0 && phase < 3) {
            return "continue";
        }
        // for each zone
        var platoonRow = 2 + z * PLATOON_ZONE_ROW_OFFSET;
        var label = discord.getZoneName(phase, z, false);
        var type = z === 0 ? 'squadron' : 'platoon';
        var _loop_3 = function (p) {
            var platoonData = sheet
                .getRange(platoonRow, 4 + p * 4, MAX_PLATOON_UNITS, 2)
                .getValues();
            // cycle through the heroes
            platoonData.some(function (e, index) {
                var member = e[1];
                if (member.length === 0 || member === 'Skip') {
                    return true;
                }
                // remove the gear
                var endIdx = member.indexOf(' (');
                if (endIdx > 0) {
                    member = member.substring(0, endIdx);
                }
                var unit = e[0];
                var entry = {
                    member: member,
                    unit: unit,
                    zone: {
                        label: label,
                        type: type,
                        index: z
                    },
                    platoon: p,
                    slot: index
                };
                entries.push(entry);
                return false;
            });
        };
        // cycle throught the platoons in a zone
        for (var p = 0; p < MAX_PLATOONS; p += 1) {
            _loop_3(p);
        }
    };
    for (var z = 0; z < MAX_PLATOON_ZONES; z += 1) {
        _loop_1(z);
    }
    entries = entries.sort(function (a, b) {
        return caseInsensitive_(a.member, b.member);
    });
    var memberMentions = discord.getMemberMentions();
    var _loop_2 = function () {
        var member = entries[0].member;
        var bucket = entries.filter(function (e) { return e.member === member; });
        entries = entries.slice(bucket.length);
        var embeds = [];
        var currentZone = bucket[0].zone;
        var currentPlatoon = bucket[0].platoon;
        var currentEmbed = {};
        embeds.push(currentEmbed);
        currentEmbed.fields = [];
        var currentField = {};
        currentEmbed.fields.push(currentField);
        currentField.name = platoonAsIcon_(currentZone.label, currentZone.type, currentPlatoon);
        currentField.value = '';
        if (currentZone.label.indexOf('Top') !== -1) {
            currentEmbed.color = 3447003;
        }
        else if (currentZone.label.indexOf('Bottom') !== -1) {
            currentEmbed.color = 15730230;
        }
        else {
            currentEmbed.color = 4317713;
        }
        for (var _i = 0, bucket_1 = bucket; _i < bucket_1.length; _i++) {
            var currentValue = bucket_1[_i];
            if (currentValue.zone.index !== currentZone.index ||
                currentValue.platoon !== currentPlatoon) {
                currentEmbed = {};
                embeds.push(currentEmbed);
                currentEmbed.fields = [];
                currentZone = currentValue.zone;
                currentPlatoon = currentValue.platoon;
                currentField = {};
                currentEmbed.fields.push(currentField);
                currentField.name = platoonAsIcon_(currentZone.label, currentZone.type, currentPlatoon);
                currentField.value = '';
                if (currentZone.label.indexOf('Top') !== -1) {
                    currentEmbed.color = 3447003;
                }
                else if (currentZone.label.indexOf('Bottom') !== -1) {
                    currentEmbed.color = 15730230;
                }
                else {
                    currentEmbed.color = 4317713;
                }
            }
            if (currentField.value !== '') {
                currentField.value += '\n';
            }
            currentField.value += displaySlot
                ? unitLabel_(currentValue.unit, currentValue.slot, forceDisplay)
                : currentValue.unit;
        }
        var mention = memberMentions[member];
        var content = memberLabel_(member, mention);
        var jsonObject = {};
        jsonObject.content = content;
        jsonObject.embeds = embeds;
        var options = urlFetchMakeParam_(jsonObject);
        urlFetchExecute_(webhookURL, options);
        Utilities.sleep(WAIT_TIME);
    };
    while (entries.length > 0) {
        _loop_2();
    }
}
/** Setup the fetch parameters */
// TODO: Make generic for all Discord webhooks
function urlFetchMakeParam_(jsonObject) {
    var options = {
        method: 'post',
        contentType: 'application/json',
        // Convert the JavaScript object to a JSON string.
        payload: JSON.stringify(jsonObject),
        muteHttpExceptions: true
    };
    return options;
}
/** Execute the fetch request */
// TODO: Make generic for all UrlFetch calls
function urlFetchExecute_(webhookURL, params) {
    // exectute the command
    try {
        UrlFetchApp.fetch(webhookURL, params);
    }
    catch (e) {
        // log the error
        Logger.log(e);
        // error sending to Discord
        var UI = SpreadsheetApp.getUi();
        UI.alert('Connection Error', 'Error sending webhook to Discord.', UI.ButtonSet.OK);
    }
}
