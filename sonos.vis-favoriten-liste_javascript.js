/*******************************************************************************
 * ---------------------------
 * Script: Favoriten-Liste in VIS ausgeben und steuern
 * 
 * Dieses Script gibt die Favoriten-Liste von Sonos in VIS aus. Durch
 * drücken auf einen Listeneintrag wird dieser Favoriten-Eintrag abgespielt.
 * Abgeschaut von Spotify: https://github.com/twonky4/ioBroker.spotify-premium/wiki/Html-Playlist
 * Vielen dank hierfür @twonky4 
 * ---------------------------
 * Quelle: https://github.com/Mic-M/iobroker.sonos.vis-favoriten-liste
 * Autor: Mic (ioBroker) | Mic-M (github)
 * Support: <Link folgt>
 * Change log:
 * 0.1 - initial version
 ******************************************************************************/


/****************************************************************************************
 * Einstellungen
 ****************************************************************************************/

// Hauptpfad zu Sonos-Gerät/Gruppe, das gesteuert werden soll, z.B. 'sonos.0.root.192_168_0_12'
const STATE_SONOS = 'sonos.0.root.192_168_0_12';

// Kompletter Datenpunkt-Pfad, in dem die HTML-Ausgabe für VIS abgelegt wird.
const STATE_FAVS_HTML = 'javascript.'+ instance + '.' + 'Sonos.Control.Music.favoriteListHtml';

// Favoriten-Liste alphabetisch sortieren? true = ja, false = nein
const SORT_LIST = true;

// Den Favoriten eine fortlaufende Nummer voranstellen (1, 2, 3, ...)?
const LIST_NO_ADD = true;  // auf false setzen, wenn nicht gewünscht.
const LIST_NO_SEP = '. ' // Trennzeichen nach der Nummer. Gilt nur, wenn LIST_NO_ADD = true gesetzt.

/**
 *  CSS-Bezeichnungen. Kann man einfach so stehen lassen.
*/
// CSS-ID für die aktuelle Auswahl
const CSS_CURRENT_SEL = 'currentSonosFavorite';
// CSS-Klasse für jeden Eintrag der Liste
const CSS_FAVORITE_ELEM = 'favoriteSonosTitle'



/*************************************************************************************************************************
 * Das war es auch schon. Ab hier nichts mehr ändern!
 *************************************************************************************************************************/

/****************************************************************************************
 * Global variables and constants
 ****************************************************************************************/
// Sonos Favorites List
const STATE_SONOS_FAVLIST = STATE_SONOS + '.favorites_list';

// Sonos Current Favorite
const STATE_SONOS_CURRENT_FAV = STATE_SONOS + '.favorites_set';


/****************************************************************************************
 * Initialize
 ****************************************************************************************/
init();
function init() {

    createStates();

    setTimeout(function(){

        // Subscribe to states
        subscribeToStates();

        // Refresh playlist initially
        refreshFavoritesList();

    }, 2000)

}

function createStates() {
    createState(STATE_FAVS_HTML, {'name':'Favorites HTML List', 'type':'string', 'read':true, 'write':true, 'role':'state', 'def':'' });
}

function subscribeToStates() {

    // Refresh if the list changes
    on({id: STATE_SONOS_FAVLIST, change: 'ne'}, function (obj) {
        refreshFavoritesList();
    });

    // Refresh if the curent favorite changes
    on({id: STATE_SONOS_CURRENT_FAV, change: 'ne'}, function (obj) {
        refreshFavoritesList();
    });

}

function refreshFavoritesList() {
	let current = getState(STATE_SONOS_CURRENT_FAV).val;
	let favArray = getState(STATE_SONOS_FAVLIST).val.split(', ');
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

		htmlResult += '\t' + '<tr onclick="vis.setValue(\'' + STATE_SONOS_CURRENT_FAV + '\', \'' + favArray[i] +'\')">' + '\n';
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
	setState(STATE_FAVS_HTML, htmlResult, true);
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
