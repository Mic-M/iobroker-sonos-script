/*******************************************************************************
 * ---------------------------
 * SONOS-Script: Bietet diverse Zusatz-Funktionen zur Steuerung von SONOS-Geräten
 * mit dem SONOS-Adapter (https://github.com/ioBroker/ioBroker.sonos).

 * ---------------------------
 * Quelle: https://github.com/Mic-M/iobroker.sonos-script
 * Autor: Mic (ioBroker) | Mic-M (github)
 * Support: https://forum.iobroker.net/topic/24743/
 * Change log:
 * 1.1 + On script start, push all Sonos favorites into custom favorites initially
 * 1.0 + Major release, added several additional functions and improvements
 * 0.3 + Create states for each Sonos device automatically
 *     + New state 'allStop' to stop all Sonos devices
 * 0.2 - Fix: added missing function isLikeEmpty()
 * 0.1 - initial version
 ******************************************************************************/


/****************************************************************************************
 * Einstellungen: Allgemein
 ****************************************************************************************/

// Datenpunkt-Pfad, unter dem die entsprechenden Script-Datenpunkte angelegt werden.
const SCRIPT_STATE_PATH = 'javascript.'+ instance + '.' + 'Sonos';

// Instanz des SONOS-Adapters. Standard ist 0.
const SONOS_ADAPTER_INSTANCE = 0;

/****************************************************************************************
 * Einstellungen: Favoriten-Liste für VIS
 ****************************************************************************************/

// Favoriten-Liste: alphabetisch sortieren? true = ja, false = nein
const SORT_LIST = true;

// Favoriten-Liste: Den Favoriten eine fortlaufende Nummer voranstellen (1, 2, 3, ...)?
const LIST_NO_ADD = true;  // auf false setzen, wenn nicht gewünscht.
const LIST_NO_SEP = '. ' // Trennzeichen nach der Nummer. Gilt nur, wenn LIST_NO_ADD = true gesetzt.

//  Favoriten-Liste: CSS-Bezeichnungen. Kann man einfach so stehen lassen.
const CSS_CURRENT_SEL = 'currentSonosFavorite';  // CSS-ID für die aktuelle Auswahl
const CSS_FAVORITE_ELEM = 'favoriteSonosTitle'   // CSS-Klasse für jeden Eintrag der Liste

/****************************************************************************************
 * Einstellungen: 'favoritesPlayPrevious' und 'favoritesPlayNext'
 ****************************************************************************************/
// Normalerweise wird bei Klicken auf Datenpunkt favoritesPlayNext/favoritesPlayPrevious
// der nächste/vorherige Favorit lt. SONOS-App abgespielt. Wir können dies aber hiermit
// alphabetisch sortieren, so dass der nächste/vorherige lt. Alphabet gespielt wird.
// true = alphabetisch sortieren, false = nicht alphabetisch sortieren
const FAVORITES_PLAY_PREV_NEXT_SORT = true;

/****************************************************************************************
 * Einstellungen: Buttons volumeUp/volumeDown zum erhöhen/verringern der Lautstärke
 ****************************************************************************************/
// um wie viel % wird erhöht/verringert beim klicken auf volumeUp/volumeDown?
const VOL_VALUE = 3;
// Maximale Lautstärke in %, mehr wird nicht erhöht.
const MAX_VOLUME = 80;


/****************************************************************************************
 * Einstellungen: Beim Abspielen immer Sonos-Geräte als Gruppe hinzufügen
 ****************************************************************************************/
// Hiermit kann man Sonos-Geräte definieren, zu denen immer beim Abspielen weitere Geräte
// als Gruppe hinzugefügt werden. 
// Zum Einschalten: auf true setzen.
const GROUP_ON_PLAY = false;

// Falls GROUP_ON_PLAY = false, fann kann man folgendes ignorieren.
// Es können beliebig viele Zeilen hinzugefügt werden.
// channelMain: Hier den Channel des 1. Gerätes eintragen, also die IP, aber "_" statt Punkt, also z.B. '192_168_10_12'
// channelsToAdd: Hier Geräte eintragen, welche zum ersten Gerät als Gruppe hinzugefügt werden sollen
//               Außerdem unter volumeAdjust das Volumen gegenüber dem channelMain nach oben oder unten anpassen.
const GROUP_ON_PLAY_DEVICES = [
    {channelMain: '192_168_10_5', channelsToAdd: [{channel:'192_168_10_7', volumeAdjust:-3}]}, 
    {channelMain: '192_168_10_10', channelsToAdd: [{channel:'192_168_10_25', volumeAdjust:-2}, {channel:'192_168_10_26', volumeAdjust:0}]}, 
];


/****************************************************************************************
 * Einstellungen: Sonstige
 ****************************************************************************************/
// Standard-Lautstärke beim Starten mit customFavoritesPlay / .customFavoritesPlayG
const PRESET_VOLUME = 15;

// Ein paar Infos im Log anzeigen?
const LOG_INFO = true;



/*************************************************************************************************************************
 * Das war es auch schon. Ab hier nichts mehr ändern!
 *************************************************************************************************************************/

/****************************************************************************************
 * Global variables and constants
 ****************************************************************************************/
// Alle Sonos-States (Geräte) in Array, also z.B. ['sonos.0.root.192_168_0_12', 'sonos.0.root.192_168_0_13']
const SONOS_CHANNELS = getAllSonosChannels(SONOS_ADAPTER_INSTANCE); 



/****************************************************************************************
 * Initialize
 ****************************************************************************************/
init();
function init() {

    createStates();

    setTimeout(function(){

        // Subscribe to states
        subscribeToStates();

        for (let lpChannel of SONOS_CHANNELS) {

            let sonosFavsArray = getState(sonosPath(lpChannel) + '.favorites_list').val.split(', ')
            let customFavsArray = getState(scriptPath(lpChannel) + '.customFavoriteList').val.split(';');

            // If custom favorites list is empty, we push all Sonos Favorites into it in the beginning.
            if (isLikeEmpty(customFavsArray)) {
                let customFavsArray = [...sonosFavsArray]; // copy array
                if (SORT_LIST) customFavsArray = arraySortCaseInsensitive(customFavsArray);
                setState(scriptPath(lpChannel) + '.customFavoriteList', customFavsArray.join(';'));                
            }

            // Refresh global HTML playlist initially
            refreshFavoritesHtmlList(lpChannel, sonosFavsArray, scriptPath(lpChannel) + '.sonosFavoriteListHtml');

            // Refresh custom HTML playlist initially
            refreshFavoritesHtmlList(lpChannel, customFavsArray, scriptPath(lpChannel) + '.customFavoriteListHtml');

            // Refresh Configuration HTML
            refreshConfigurationHtml(lpChannel);

            setTimeout(function(){

                // Clean Custom Favorites List, if Sonos Favorite was deleted.
                // We perfom this also in the beginning.
                cleanCustomFavoritesList(lpChannel);

            }, 2000);

        }

    }, 2000);

}



function createStates() {
    for (let lpChannel of SONOS_CHANNELS) {
        createState(scriptPath(lpChannel) + '.sonosFavoriteListHtml', {'name':'Sonos Favorites HTML List', 'type':'string', 'read':true, 'write':true, 'role':'media.list', 'def':'' });
        createState(scriptPath(lpChannel) + '.sonosFavoritesPlayNext', {'name':'Favorites: play next', 'type':'boolean', 'read':false, 'write':true, 'role':'button', 'def':false });
        createState(scriptPath(lpChannel) + '.sonosFavoritesPlayPrevious', {'name':'Favorites: play previous', 'type':'boolean', 'read':false, 'write':true, 'role':'button', 'def':false });
        createState(scriptPath(lpChannel) + '.customFavoriteAdd', {'name':'Custom Favorites: Add a favorite', 'type':'string', 'read':true, 'write':true, 'role':'state', 'def':'' });
        createState(scriptPath(lpChannel) + '.customFavoriteRemove', {'name':'Custom Favorites: Remove a favorite', 'type':'string', 'read':true, 'write':true, 'role':'state', 'def':'' });
        createState(scriptPath(lpChannel) + '.customFavoriteList', {'name':'Custom Favorites List', 'type':'string', 'read':true, 'write':true, 'role':'state', 'def':'' });
        createState(scriptPath(lpChannel) + '.customFavoriteListHtml', {'name':'Custom Favorites HTML List', 'type':'string', 'read':true, 'write':true, 'role':'media.list', 'def':'' });
        createState(scriptPath(lpChannel) + '.customFavoriteConfigHtml', {'name':'Custom Favorites HTML Configuration', 'type':'string', 'read':true, 'write':true, 'role':'state', 'def':'' });
        createState(scriptPath(lpChannel) + '.customFavoriteToggleConfigVis', {'name':'Custom Favorites: For Vis to toggle config', 'type':'boolean', 'read':true, 'write':true, 'role':'state', 'def':false });
        createState(scriptPath(lpChannel) + '.customFavoritesPlay', {'name':'Custom Favorites: Start playing and set default volume for device', 'type':'boolean', 'read':false, 'write':true, 'role':'button', 'def':false });
        createState(scriptPath(lpChannel) + '.customFavoritesPlayG', {'name':'Custom Favorites: Start playing and set default volume for GROUP', 'type':'boolean', 'read':false, 'write':true, 'role':'button', 'def':false });
        createState(scriptPath(lpChannel) + '.customFavoritesPlayNext', {'name':'Custom Favorites: play next', 'type':'boolean', 'read':false, 'write':true, 'role':'button', 'def':false });
        createState(scriptPath(lpChannel) + '.customFavoritesPlayPrevious', {'name':'Custom Favorites: play previous', 'type':'boolean', 'read':false, 'write':true, 'role':'button', 'def':false });
        createState(scriptPath(lpChannel) + '.customFavoritesPlayByNumber',  {'name':'Custom Favorites: Play a favorite by number (1-x)', 'type':'number', 'min':1, 'max':999, 'read':true, 'write':true, 'role':'state' });
        createState(scriptPath(lpChannel) + '.volumeUp', {'name':'Increase volume', 'type':'boolean', 'read':false, 'write':true, 'role':'button', 'def':false });
        createState(scriptPath(lpChannel) + '.volumeDown', {'name':'Decrease volume', 'type':'boolean', 'read':false, 'write':true, 'role':'button', 'def':false });
        createState(scriptPath(lpChannel) + '.volumeGroupUp', {'name':'Increase volume of group', 'type':'boolean', 'read':false, 'write':true, 'role':'button', 'def':false });
        createState(scriptPath(lpChannel) + '.volumeGroupDown', {'name':'Decrease volume of group', 'type':'boolean', 'read':false, 'write':true, 'role':'button', 'def':false });
    }
    createState(SCRIPT_STATE_PATH + '.' + 'allStop', {'name':'Stop all Sonos devices', 'type':'boolean', 'read':false, 'write':true, 'role':'button', 'def':false });
}


function subscribeToStates() {

    for (let lpChannel of SONOS_CHANNELS) {

        /*******************************************
         * Global Favorites
         *******************************************/

        /**
         * Refresh if the Sonos Favorites list changes
         */
        on({id: sonosPath(lpChannel) + '.favorites_list', change: 'ne'}, function (obj) {
            let channel = getChannel(obj.id);

            // Refresh HTML
            refreshFavoritesHtmlList(channel, getState(sonosPath(channel) + '.favorites_list').val.split(', '), scriptPath(channel) + '.sonosFavoriteListHtml'); // Nun können wir refreshen

            // Refresh Configuration HTML
            refreshConfigurationHtml(channel);

            // Clean Custom Favorites List, if Sonos Favorite was deleted
            cleanCustomFavoritesList(channel);

        });

        /**
         *  Refresh if the current favorite changes
         */
        on({id: sonosPath(lpChannel) + '.favorites_set', change: 'ne'}, function (obj) {
            let channel = getChannel(obj.id)
            refreshFavoritesHtmlList(channel, getState(sonosPath(channel) + '.favorites_list').val.split(', '), scriptPath(channel) + '.sonosFavoriteListHtml'); // Nun können wir refreshen
        });

        /**
         *  Play next Sonos favorite
         */
        on({id: scriptPath(lpChannel) + '.sonosFavoritesPlayNext', change: 'any', val:true}, function (obj) {
            let favsArray = getState(sonosPath(lpChannel) + '.favorites_list').val.split(', ');
            if (FAVORITES_PLAY_PREV_NEXT_SORT) favsArray = arraySortCaseInsensitive(favsArray);
            favoritesPlayNext(lpChannel, favsArray, true);
        });

        /**
         *  Play previous Sonos favorite
         */
        on({id: scriptPath(lpChannel) + '.sonosFavoritesPlayPrevious', change: 'any', val:true}, function (obj) {
            let favsArray = getState(sonosPath(lpChannel) + '.favorites_list').val.split(', ');
            if (FAVORITES_PLAY_PREV_NEXT_SORT) favsArray = arraySortCaseInsensitive(favsArray);
            favoritesPlayNext(lpChannel, favsArray, false);
        });


        /*******************************************
         * Custom Favorites
         *******************************************/

        /**
         * Refresh if the Custom Favorites list changes
         */
        on({id: scriptPath(lpChannel) + '.customFavoriteList', change: 'ne'}, function (obj) {
            let channel = getChannel(obj.id);

            // Refresh Custom Favorites HTML List
            refreshFavoritesHtmlList(channel, getState(scriptPath(channel) + '.customFavoriteList').val.split(';'), scriptPath(channel) + '.customFavoriteListHtml'); // Nun können wir refreshen
            
            // Refresh Configuration HTML
            refreshConfigurationHtml(channel);

        });

        /**
         *  Refresh if the current Sonos favorite changes
         */
        on({id: sonosPath(lpChannel) + '.favorites_set', change: 'ne'}, function (obj) {
            let channel = getChannel(obj.id);
            refreshFavoritesHtmlList(channel, getState(scriptPath(lpChannel) + '.customFavoriteList').val.split(';'), scriptPath(channel) + '.customFavoriteListHtml'); // Nun können wir refreshen
        });



        /**
         *  Add a Favorite to Custom Favorite List
         */
        on({id: scriptPath(lpChannel) + '.customFavoriteAdd', change: 'any'}, function (obj) {
            if(! isLikeEmpty(obj.state.val)) {
                customFavoritesAddRemove(lpChannel, obj.state.val, true);
                if(LOG_INFO) log('[' + obj.state.val + '] added to custom favorite list.');
                setStateDelayed(obj.id, '', 500);
            }
        });

        /**
         *  Remove a Favorite from Custom Favorite List
         */
        on({id: scriptPath(lpChannel) + '.customFavoriteRemove', change: 'any'}, function (obj) {
            if(! isLikeEmpty(obj.state.val)) {
                customFavoritesAddRemove(lpChannel, obj.state.val, false);
                if(LOG_INFO) log('[' + obj.state.val + '] removed from custom favorite list.');
                setStateDelayed(obj.id, '', 500);
            }
        });

        /**
         *  Play next custom favorite
         */
        on({id: scriptPath(lpChannel) + '.customFavoritesPlayNext', change: 'any', val:true}, function (obj) {
            let favsArray = getState(scriptPath(lpChannel) + '.customFavoriteList').val.split(';');
            favoritesPlayNext(lpChannel, favsArray, true);
        });

        /**
         *  Play previous custom favorite
         */
        on({id: scriptPath(lpChannel) + '.customFavoritesPlayPrevious', change: 'any', val:true}, function (obj) {
            let favsArray = getState(scriptPath(lpChannel) + '.customFavoriteList').val.split(';');
            favoritesPlayNext(lpChannel, favsArray, false);
        });

        /*******************************************
         * Volume
         *******************************************/
        /**
         * Volume Up: Device
         */
        on({id: scriptPath(lpChannel) + '.volumeUp', change: 'any', val:true}, function (obj) {
            let channel = getChannel(obj.id);
            volumeUp(channel, 'volume', true, VOL_VALUE);
        });

        /**
         * Volume Down: Device
         */
        on({id: scriptPath(lpChannel) + '.volumeDown', change: 'any', val:true}, function (obj) {
            let channel = getChannel(obj.id);
            volumeUp(channel, 'volume', false, VOL_VALUE);
        });

        /**
         * Volume Up: Group
         */
        on({id: scriptPath(lpChannel) + '.volumeGroupUp', change: 'any', val:true}, function (obj) {
            let channel = getChannel(obj.id);
            volumeUp(channel, 'group_volume', true, VOL_VALUE);
        });

        /**
         * Volume Down: Group
         */
        on({id: scriptPath(lpChannel) + '.volumeGroupDown', change: 'any', val:true}, function (obj) {
            let channel = getChannel(obj.id);
            volumeUp(channel, 'group_volume', false, VOL_VALUE);
        });

        /*******************************************
         * Others
         *******************************************/

        /**
         * Custom Favorites: Play favorite by number.
         */
        on({id: scriptPath(lpChannel) + '.customFavoritesPlayByNumber', change: 'any'}, function (obj) {
            let channel = getChannel(obj.id);
            playCustomFavoriteByNumber(channel, obj.state.val);
        });

        /**
         * Custom Favorites: Start playing and set standard volume level to device
         */
        on({id: scriptPath(lpChannel) + '.customFavoritesPlay', change: 'any', val:true}, function (obj) {
            let channel = getChannel(obj.id);
            sonosStart(channel, 'volume', PRESET_VOLUME);
        });

        /**
         * Custom Favorites: Start playing and set standard volume level to GROUP
         */
        on({id: scriptPath(lpChannel) + '.customFavoritesPlayG', change: 'any', val:true}, function (obj) {
            let channel = getChannel(obj.id);
            sonosStart(channel, 'group_volume', PRESET_VOLUME);
        });

    }

    /**
     * Group Sonos devices once status is play
     */
    if (GROUP_ON_PLAY) {
        for (let lpItem of GROUP_ON_PLAY_DEVICES) {
            let channelMain = lpItem['channelMain'];
            on({id: sonosPath(channelMain) + '.state_simple', change: 'any', val:true}, function (obj) {
                let channel = getChannel(obj.id);
                groupSonos(channel)
            });

        }
    }
   /**
     * Stop playing at all Sonos devices
     */
    on({id: SCRIPT_STATE_PATH + '.' + 'allStop', change: "any", val: true}, function(obj) {

        for (let lpChannel of SONOS_CHANNELS) {
            setState(sonosPath(lpChannel) + '.stop', true);
        }
        setState(obj.id, false); // jetzt Datenpunkt wieder auf false setzen. https://forum.iobroker.net/topic/12708/
    
    });

}

/***********
 * Clean custom favorites list, if a Sonos Favorite was removed.
 * @param {string}  channel    The channel xx_xx_xx_xx
 */
function cleanCustomFavoritesList(channel){

    // Sonos Favorites in Array
    let sonosFavsArray = getState(sonosPath(channel) + '.favorites_list').val.split(', ');

    // Custom Favorites in Array
    let customFavsArray = getState(scriptPath(channel) + '.customFavoriteList').val.split(';');

    // Now remove all items from Custom Favs Array, if not existing in Sonos Favorites
    let resultArray = [];
    for (let lpCustomItem of customFavsArray) {
        if (sonosFavsArray.indexOf(lpCustomItem) != -1) {
            resultArray.push(lpCustomItem);
        }
    }

    setState(scriptPath(channel) + '.customFavoriteList', resultArray.join(';'));

}


/***********
 * Adds or removes a favorite to/from custom favorite list
 * @param {string}  channel    The channel xx_xx_xx_xx
 * @param {string}  favorite   The favorite to add or remove
 * @param {boolean} add        add if true, or remove, if false
 */
function customFavoritesAddRemove(channel, favorite, add) {
    favorite = favorite.replace (/,/g, ''); // Remove any comma from string.
    let statePth = scriptPath(channel) + '.customFavoriteList';
    let customFavorites = getState(statePth).val.split(';');
    if (! isLikeEmpty(favorite)) {
        if(add) {
            if (customFavorites.indexOf(favorite) == -1) {
                // Check if given favorite is member of Sonos favorites.
                let sonosFavs = getState(sonosPath(channel) + '.favorites_list').val.split(', ');
                if (sonosFavs.indexOf(favorite) != -1) {
                    customFavorites.push(favorite);
                    customFavorites = cleanArray(customFavorites); // just in case
                    if (SORT_LIST) customFavorites = arraySortCaseInsensitive(customFavorites);
                    setState(statePth, customFavorites.join(';'));
                }
            }
        } else { // remove
            if (customFavorites.indexOf(favorite) != -1) {
                customFavorites = arrayRemoveElementsByValue(customFavorites, favorite, true);
                customFavorites = cleanArray(customFavorites); // just in case
                setState(statePth, customFavorites.join(';'));
            }
        }

    }
}




/***********
 * Returnes the Sonos path for a given channel.
 * @param {string} channel    The channel xx_xx_xx_xx
 * @return {string} the Sonos path, e.g. 'sonos.0.root.192_168_0_15'
 */
function sonosPath(channel) {
    return 'sonos.' + SONOS_ADAPTER_INSTANCE + '.root.' + channel;
}
/***********
 * Returnes the Script path for a given channel.
 * @param {string} channel    The channel xx_xx_xx_xx
 * @return {string} the Script path, e.g. 'javascript.0.Sonos.192_168_0_15'
 */
function scriptPath(channel) {
    return SCRIPT_STATE_PATH + '.' + channel;
}



/***********
 * Refreshes the current Favorites HTML List.
 * @param {string} channel    The channel xx_xx_xx_xx
 * @param {string} favArray   Array of the Favorites
 * @param {string} state      The state to update
 */
function refreshFavoritesHtmlList(channel, favArray, state) {

	let current =  getState(sonosPath(channel) + '.favorites_set').val;
    let favArrayDisplay;
    let htmlResult;

    /*****
     * Sort Array case insensitive
     ****/
    if (SORT_LIST) favArray = arraySortCaseInsensitive(favArray);
    
    

    /*****
     * After sorting, we do some stuff to the displayed value
     ****/
    favArrayDisplay = [...favArray]; // copy
    for (let i = 0; i < favArrayDisplay.length; i++) {
        let strResult = favArrayDisplay[i];

        // Strip HTML: https://stackoverflow.com/questions/822452/strip-html-from-text-javascript
        strResult = strResult.replace(/<[^>]*>?/gm, '');

        // Add number to each element
        if(LIST_NO_ADD) strResult = (i+1) + LIST_NO_SEP + strResult;

        // Finally, set to element
        favArrayDisplay[i] = strResult;

    }

    if (SORT_LIST) favArray = arraySortCaseInsensitive(favArray);

    /*****
     * Build Playlist
     ****/
    htmlResult = '<table>' + '\n';
    for (let i = 0; i < favArray.length; i++) {

		htmlResult += '\t' + '<tr onclick="vis.setValue(\'' + sonosPath(channel) + '.favorites_set' + '\', \'' + favArray[i] +'\')">' + '\n';
		htmlResult += '\t\t' + '<td>';
		let strCSSCurrPlaylist = '';
		if (isLikeEmpty(current) === false) {
		    if( current == favArray[i] ) {
		        strCSSCurrPlaylist = ' id="' + CSS_CURRENT_SEL + '"';
		    }
		} 
		htmlResult += '<div class="' + CSS_FAVORITE_ELEM + '"' + strCSSCurrPlaylist + '>';
		htmlResult += favArrayDisplay[i];
		htmlResult += '</div>';
		htmlResult += '</td>' + '\n';
		htmlResult += '\t' + '</tr>' + '\n';
	}

	htmlResult += '</table>' + '\n';

	/***************************
	 * Automatisches Scrollen der aktuellen Playlist
	 * Abgeschaut von: https://forum.iobroker.net/viewtopic.php?f=30&t=18222#p196640
     * 28-Aug-2018: Noch ergänzt: "if (element != undefined)". Sonst wird die Liste unsauber dargestellt.
	 ***************************/
    htmlResult += '<script>';
	    htmlResult += 'let element = document.getElementById("' + CSS_CURRENT_SEL + '");'; // ID von dem aktuellen DIV in der TABLE oben
	    htmlResult += "if (element != undefined) element.scrollIntoView(true);"; //true = Position oben / false = Position unten
	htmlResult += '</script>';
	/****************************/

    // Finally: set state
    setState(state, htmlResult, true);

}

function refreshConfigurationHtml(channel) {
    
    let sonosFavsArray = getState(sonosPath(channel) + '.favorites_list').val.split(', '); // Sonos Favorites in Array
    if (SORT_LIST) sonosFavsArray = arraySortCaseInsensitive(sonosFavsArray);
    let customFavsArray = getState(scriptPath(channel) + '.customFavoriteList').val.split(';'); // Custom Favorites in Array

    let favArrayDisplay;
    let htmlResult;

    /*****
     * After sorting, we do some stuff to the displayed value
     ****/
    favArrayDisplay = [...sonosFavsArray]; // copy
    for (let i = 0; i < favArrayDisplay.length; i++) {
        let strResult = favArrayDisplay[i];

        // Strip HTML: https://stackoverflow.com/questions/822452/strip-html-from-text-javascript
        strResult = strResult.replace(/<[^>]*>?/gm, '');

        // Add number to each element
        if(LIST_NO_ADD) strResult = (i+1) + LIST_NO_SEP + strResult;

        // Finally, set to element
        favArrayDisplay[i] = strResult;

    }

    /*****
     * Build Playlist
     ****/
    htmlResult = '<table>' + '\n';
    for (let i = 0; i < sonosFavsArray.length; i++) {

        // Indicates if current loop item is element of custom favorites list
        let isActive = (customFavsArray.indexOf(sonosFavsArray[i]) != -1) ? true : false;
        let stateAddRemove = (isActive) ? '.customFavoriteRemove' : '.customFavoriteAdd';
        let classAddRemove = (isActive) ? 'removeFav' : 'addFav';


		htmlResult += '\t' + '<tr onclick="vis.setValue(\'' + scriptPath(channel) + stateAddRemove + '\', \'' + sonosFavsArray[i] +'\')">' + '\n';
		htmlResult += '\t\t' + '<td>';

		htmlResult += '<div class="' + CSS_FAVORITE_ELEM + ' ' + classAddRemove + '"' + '>';
		htmlResult += favArrayDisplay[i];
		htmlResult += '</div>';
		htmlResult += '</td>' + '\n';
		htmlResult += '\t' + '</tr>' + '\n';
	}

	htmlResult += '</table>' + '\n';

    // Finally: set state
    setState(scriptPath(channel) + '.customFavoriteConfigHtml', htmlResult, true);

}




/**
 * Damit bekommen wir alle existierenden Sonos-Channels, wie 'xx_xx_xx_xx' von 'sonos.0.root.xx_xx_xx_xx' als Array
 * @param {number}  instance  Die Instanz des Sonos-Adapters.
 * @return {object} Array mit Channel aller Sonos-Geräte wie z.B. ['xx_xx_xx_xx', 'yy_yy_yy_yy').
 *                  Falls nicht gefunden: leeres Array.
 */
function getAllSonosChannels(instance) {

    let resultArray = [];
    let mSelector = $('[id=^sonos.' + instance + '.root.*.pause]');
    mSelector.each(function(id, i) {
        
        // Nun haben wir mit "id" die State-ID, z.B. sonos.0.root.xx_xx_xx_xx.pause
        // Wir trennen dieses String nun in ein Array auf.
        let lpArr = id.split("."); 
        // Element Nr. 3 enthält xx_xx_xx_xx
        let loopChannel = lpArr[3];

        // Ins Array setzen
        resultArray.push(loopChannel);
        
    });

    return resultArray;

}

/**
 * Play next or previous favorite
 * @param {string} channel   The channel xx_xx_xx_xx
 * @param {object} favArray  Array with the favorites
 * @param {boolean} [playNext=true]  Optional: If true: play next, if false: play previous. Default: true
 */
function favoritesPlayNext(channel, favArray, playNext) {
    if (playNext === undefined) playNext = true;

    // Current favorite from Sonos Adapter
    let currentFavSonosAdapter = getState(sonosPath(channel) + '.favorites_set').val;

    // Check if it is in our favorites list.
    // If not, we just set the first element of our custom list as current favorite.
    if ( (currentFavSonosAdapter == '') || (favArray.indexOf(currentFavSonosAdapter) == -1) ) {  // indexOf() return the index of an element in the array, or -1 if it's not in the array.
        currentFavSonosAdapter = favArray[0];
    }

    // Get next or previous favorite
    let nextFav = arrayGetNextOrPreviousValue(favArray, currentFavSonosAdapter, playNext);
    // set it to state
    setState(sonosPath(channel) + '.favorites_set', nextFav);
    if (LOG_INFO) log('Sonos umgeschaltet auf: ' + nextFav);

}

/**
 * Play favorite by number
 * @param {string} channel    The channel xx_xx_xx_xx
 * @param {number} favNo      Number of favorites. Start with 1 for first favorite (not 0).
 */
function playCustomFavoriteByNumber(channel, favNo) {
    if (favNo == 0) favNo = 1;
    let customFavorites = getState(scriptPath(channel) + '.customFavoriteList').val.split(';');
    if (customFavorites[favNo-1] != undefined) {
        setState(sonosPath(channel) + '.favorites_set', customFavorites[favNo-1]);
        if(LOG_INFO) log('Sonos umgeschaltet Favorit ' + favNo + ': ' + customFavorites[favNo-1]);
    } else {
        log('Sonos Favorit Nummer ' + favNo + ' wurde nicht gefunden.');
    }
}


/**
 * Custom Favorites: Start Playing
 * @param {string} channel    The channel xx_xx_xx_xx
 * @param {string} volType    'volume': volume of device; 'group_volume': the group volume
 * @param {number} [volume=15]  Optional: Volume
 * @param {number} [position] Optional: Position in Favorites (starts with 1, not 0). If not provided, we use current set favorite
 */
function sonosStart(channel, volType, volume, position) {
    if (volume === undefined) volume = 15;
    if (position === undefined) position = -1; // No position provided, so we set to -1, to use current pos later
    if (position === 0) position = 1;
    let customFavorites = getState(scriptPath(channel) + '.customFavoriteList').val.split(';');

    // get current favorite from Sonos Adapter
    let currentFavorite = getState(sonosPath(channel) + '.favorites_set').val;
    // Check if it is in our custom favorites list.
    // If not, we just set the first element of our custom list as current favorite.
    if ( (currentFavorite == '') || (customFavorites.indexOf(currentFavorite) == -1) ) {  // indexOf() return the index of an element in the array, or -1 if it's not in the array.
        currentFavorite = customFavorites[0];
    }

    // If position was provided, we set accordingly.
    if (position != -1) {
        if (customFavorites[position-1] != undefined) {
            currentFavorite = customFavorites[position-1]
        }
    }

    setState(sonosPath(channel) + '.favorites_set', currentFavorite);   // play favorite
    setState(sonosPath(channel) + '.' + volType, volume) // Set volume
    log('Sonos gestartet (Lautstärke ' + volume + '): ' + currentFavorite);
}



/**
 * Increase or decrease volume
 * @param {string} channel    The channel xx_xx_xx_xx
 * @param {string} volType    'volume': volume of device; 'group_volume': the group volume
 * @param {boolean} increase  if true: increase, if false: decrease  
 * @param {number} [value=3]  Optional: increase by how much. Default: 3
 */
function volumeUp(channel, volType, increase, value) {
    if (value === undefined) value = 3;
    let currentVolume = getState(sonosPath(channel) + '.' + volType).val;
    log (currentVolume);
    let newVolume;
    let logTxt;
    if (increase) {
        newVolume = currentVolume + value;
        if (newVolume > MAX_VOLUME) newVolume = MAX_VOLUME;
        logTxt = 'erhöht';
    } else {
        newVolume = currentVolume - Math.abs(value); // We accept also positive numbers, so remove minus
        if (newVolume <= 1) newVolume = 1; // Mindestens auf Lautstärke 1 belassen
        logTxt = 'verringert';
    }
    setState(sonosPath(channel) + '.' + volType, newVolume);
    if(LOG_INFO) log('Sonos-Lautstärke um ' + value + ' auf ' + newVolume + ' ' + logTxt + '.');
}

/****************
 * Groups Sonos devices, per GROUP_ON_PLAY_DEVICES
 * @param {string} channelMain    The Main Channel, xx_xx_xx_xx
 ****************/
function groupSonos(channelMain) {

    let channelsToAdd = getConfigValuePerKey(GROUP_ON_PLAY_DEVICES, 'channelMain', channelMain, 'channelsToAdd');
    let currentMemberChannels = getState(sonosPath(channelMain) + '.membersChannels').val.split(',');

    for (let lpChannelAddItem of channelsToAdd) {
        let lpChannelToAdd = lpChannelAddItem['channel'];
        let lpChannelToAddVolumeAdjust = lpChannelAddItem['volumeAdjust'];

        if (currentMemberChannels.indexOf(lpChannelToAdd) === -1) {    

            // channel is not in the current member channels list, so we add it
            setState(sonosPath(channelMain) + '.add_to_group', lpChannelToAdd);

            // Next, we adjust the volume
            let currVolumeMain = getState(sonosPath(channelMain) + '.volume').val;
            let volForNewChannel = currVolumeMain + lpChannelToAddVolumeAdjust;
            setState(sonosPath(lpChannelToAdd) + '.volume', volForNewChannel);

            // Log
            if(LOG_INFO) log('Sonos device ' + lpChannelToAdd + ' added to ' + channelMain + '. Adjusted volume by [' + lpChannelToAddVolumeAdjust + '].')

        }
    }

}




/**
 * Get channel from Sonos or Script state.
 * @param {string} state      Sonos State, e.g. sonos.0.root.xx_xx_xx_xx.favorites_set
 *                            Or Scrript state, e.g. javascript.0.Sonos.xx_xx_xx_xx.customFavoriteList
 * @return {string} The channel xx_xx_xx_xx
 */
function getChannel(state) {
    let lpArr = state.split("."); // Nun haben wir mit "obj.id" die State-ID, z.B. sonos.0.root.xx_xx_xx_xx.favorites_set. Wir trennen dieses String nun in ein Array auf.
    let channel = lpArr[lpArr.length - 2]; // Channel auslesen, also xx_xx_xx_xx
    return channel;
}


/**
 * Sort array case-insensitive
 * @param {object} arrayInput  Array to be sorted
 * @return {object}   case-insensitive sorted array
 */
function arraySortCaseInsensitive(arrayInput) {
    let arrayResult = [...arrayInput]; // We use array spreads '...' to copy array. If not, array is changed by reference and not value.
    arrayResult.sort(function (a, b) {
        return a.toLowerCase().localeCompare(b.toLowerCase());
    });
    return arrayResult;
}

/**
 * Checks if Array or String is not undefined, null or empty.
 * 08-Sep-2019: added check for [ and ] to also catch arrays with empty strings.
 * @param inputVar - Input Array or String, Number, etc.
 * @return true if it is undefined/null/empty, false if it contains value(s)
 * Array or String containing just whitespaces or >'< or >"< or >[< or >]< is considered empty
 */
function isLikeEmpty(inputVar) {
    if (typeof inputVar !== 'undefined' && inputVar !== null) {
        let strTemp = JSON.stringify(inputVar);
        strTemp = strTemp.replace(/\s+/g, ''); // remove all whitespaces
        strTemp = strTemp.replace(/\"+/g, "");  // remove all >"<
        strTemp = strTemp.replace(/\'+/g, "");  // remove all >'<
        strTemp = strTemp.replace(/\[+/g, "");  // remove all >[<
        strTemp = strTemp.replace(/\]+/g, "");  // remove all >]<
        if (strTemp !== '') {
            return false;
        } else {
            return true;
        }
    } else {
        return true;
    }
}


/**
 * Returns the next or previous element of an array for a given element.
 * Use case is to easily switch through an array of elements...
 * If it is the last element of the array, it will return the first one, if bNext is true.
 * If it is the first element of the array, it will return the last one, if bNext is false.
 * If not found, it will ALWAYS return the first element.
 *
 * @param {array}   inputArray  Array
 * @param {string}  strElement  for this String we want to get the next/previous array element
 * @param {boolean} bNext       next element if true, previous element if false
 * @return {string} The next or previous element from the array
 */
function arrayGetNextOrPreviousValue(inputArray, strElement, bNext) {
    let iLength = inputArray.length; // Number of elements in the Array
    let iPosition = inputArray.indexOf(strElement) + 1; // Current position. We add 1 since first element is in position 0
    let iPositionNext = iPosition + 1;
    let iPositionPrevious = iPosition - 1;
    
    if (bNext) {
        // if not found, it will return the first element...
        if (iPositionNext > iLength) iPositionNext = 1;
        return inputArray[iPositionNext - 1];
    } else {
        if (iPosition === 0) { // will be zero if not found
            return inputArray[0]; // return the first element, if not found
        } else {
            if (iPositionPrevious < 1) iPositionPrevious = iLength;
            return inputArray[iPositionPrevious - 1];
        }
    }
}


/**
 * Removing Array element(s) by input value. 
 * @param {array}   arr             the input array
 * @param {string}  valRemove       the value to be removed
 * @param {boolean} [exact=true]    OPTIONAL: default is true. if true, it must fully match. if false, it matches also if valRemove is part of element string
 * @return {array}  the array without the element(s)
 */
function arrayRemoveElementsByValue(arr, valRemove, exact) {

    if (exact === undefined) exact = true;

    for ( let i = 0; i < arr.length; i++){ 
        if (exact) {
            if ( arr[i] === valRemove) {
                arr.splice(i, 1);
                i--; // required, see https://love2dev.com/blog/javascript-remove-from-array/
            }
        } else {
            if (arr[i].indexOf(valRemove) != -1) {
                arr.splice(i, 1);
                i--; // see above
            }
        }
    }
    return arr;
}


/**
 * Clean Array: Removes all falsy values: undefined, null, 0, false, NaN and "" (empty string)
 * Source: https://stackoverflow.com/questions/281264/remove-empty-elements-from-an-array-in-javascript
 * @param {array} inputArray       Array to process
 * @return {array}  Cleaned array
 */
function cleanArray(inputArray) {
  var newArray = [];
  for (let i = 0; i < inputArray.length; i++) {
    if (inputArray[i]) {
      newArray.push(inputArray[i]);
    }
  }
  return newArray;
}

/**
 * Removes all elements from an array contained in a second array.
 * It will ignore values of the second array, if not found in sourceArray.
 * Source: https://stackoverflow.com/questions/19957348/javascript-arrays-remove-all-elements-contained-in-another-array
 * @param {object} sourceArray    The array from which to remove the elements
 * @param {object} arrayToRemove  The array which elements we remove from sourceArray
 * @return {object} array without elements of arrayToRemove
 */
function arrayRemoveOtherArray(sourceArray, arrayToRemove) {
    let arrayResult = [...sourceArray]; // Copy given array, we use array spreads '...'
    arrayResult = arrayResult.filter( function(element) {
        return !arrayToRemove.includes(element);
    } );
    return arrayResult;
}




/**
 * Retrieve values from a CONFIG variable, example:
 * const CONF = [{car: 'bmw', color: 'black', hp: '250'}, {car: 'audi', color: 'blue', hp: '190'}]
 * To get the color of the Audi, use: getConfigValuePerKey(CONF, 'car', 'audi', 'color')
 * To find out which car has 190 hp, use: getConfigValuePerKey(CONF, 'hp', '190', 'car')
 * @param {object}  config     The configuration variable/constant
 * @param {string}  key1       Key to look for.
 * @param {string}  key1Value  The value the key should have
 * @param {string}  key2       The key which value we return
 * @returns {any}    Returns the element's value, or number -1 of nothing found.
 */
function getConfigValuePerKey(config, key1, key1Value, key2) {
    for (let lpConfDevice of config) {
        if ( lpConfDevice[key1] === key1Value ) {
            if (lpConfDevice[key2] === undefined) {
                return -1;
            } else {
                return lpConfDevice[key2];
            }
        }
    }
    return -1;
}
