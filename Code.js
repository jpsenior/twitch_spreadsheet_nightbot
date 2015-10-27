/*The MIT License (MIT)

Copyright (c) 2015 JP Senior jp.senior@gmail.com

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
/* This application is intended to be used by a Twitch.TV 'nightbot' command
   to allow streamers  to provide searchign ability for 'games beaten'.
   This is intended for completionists.
   
   Written by sartan sartandragonbane - with extra help from fo__ for better
   code structure. Thanks, Fo!
   
   In order to integrate this, you need to create a nightbot command using
   the custom API feature.
   
   !addcom !search $(customapi https://script.google.com/macros/s/AKfycbzbFd-UHGQVq9biiwgD5GY0GfXpluplrqvPJlG6v88NX4rqtWKP/exec?action=game&query=$(query))
   !addcom !invite $(customapi https://script.google.com/macros/s/AKfycbzbFd-UHGQVq9biiwgD5GY0GfXpluplrqvPJlG6v88NX4rqtWKP/exec?action=invite&username=$(touser)&oauth=<OAUTH>)
   !addcom !translate $(customapi https://script.google.com/macros/s/AKfycbzbFd-UHGQVq9biiwgD5GY0GfXpluplrqvPJlG6v88NX4rqtWKP/exec?action=translate&from=en&to=pt&text=$(query))
   Where the URL included is the twitch URL.
   
*/


// TODO:
// - Minimum query length
// - Clean up smileys when printing the "not found" message
// - Remove THE/A and such things in clean()
// - Replace roman numerals with numbers (VI -> 6)
// - There's a problem if "&" character (and possibly others) is used in game queries.
//   The problem is that the query done by nightbot doesn't escape the & character properly
//   (and AFAIK there's no way to make it escape it), so it appears as a start of the next parameter
//   to the script. E.g. if query is "battletoads & foobar" nightbot does query: blah?game=battletoads&foobar
//   A proper fix would be to get nightbot to escape the parameter, but if that's not possible,
//   e.queryString could be used to figure out the full query.




var ss = SpreadsheetApp.openByUrl(
  'https://docs.google.com/spreadsheets/d/sheet url here/edit#gid=0'
);

var twitchIcon = 'Kappa'

var inviteRoomName = "Spoilers chat"

var inviteRoom = "_group_Chat_Room"

// Do not edit anything below this line for end user stuff. //

// Little bit less than 400 so that the extra text can fit in.
var MAX_RESULT_LENGTH = 350

var integerRegex = /^[0-9]+$/;

var asteriskRegex = /^\*.*/;


function clean( str )
{
  return str
    .toUpperCase()
    .replace( /[^A-Z0-9]/g, "" );
}

function formatDate( date )
{
  var timezone = ss.getSpreadsheetTimeZone();
  
  // If date is a Date, format it. Otherwise use it as is.
  if ( date instanceof Date )
    return Utilities.formatDate( date, timezone, "M/d/yyyy");
  else
    return String( date );
}

function zeroPad( number )
{
  if ( number < 10 )
    return "0" + number;
  
  return String( number );
}

function isEmptyTrimmed( string )
{
  return String( string ).trim().length === 0;
}

function formatDuration( durationDate )
{
  if ( !( durationDate instanceof Date ) )
    return String( durationDate );
  
  // This is the epoch of "Duration" typed fields in sheet.
  // Unfortunately it depends on the time zone that the sheet is set to,
  // but should work fine as long as the sheet time zone is not changed.
  // It can be found out by fetching a Duration field "00:00" from the sheet.
  var epoch = new Date( "Sat, 30 Dec 1899 06:36:36 GMT" );
  
  var millis  = durationDate - epoch;
  var seconds = millis/1000;
  var minutes = seconds/60;
  var hours   = minutes/60;
  
  return Math.floor( hours )
    + ":" + zeroPad( Math.floor( minutes%60 ) )
    + ":" + zeroPad( Math.floor( seconds%60 ) );
}

function formatResultLong( result )
{
  // Index string may be empty.
  var resultString = "";
  if ( !isEmptyTrimmed( result.index ) )
    resultString += result.index + ". ";

  // If "date beaten" field is empty, return smth else.
  if ( String( result.dateBeaten ).trim().length === 0 )
    return resultString + result.game
         + " (chosen by " + result.chosenBy
         + ") hasn't been beaten yet";
  
  resultString += result.game + " (chosen by " + result.chosenBy
                  + ") was beaten on " + result.dateBeaten;
  
  if ( !isEmptyTrimmed( result.time ) )
    resultString += " in " + result.time;
  
  if ( !isEmptyTrimmed( result.rating ) )
    resultString += ", rated " + result.rating + "/10";
  
    if ( !isEmptyTrimmed( result.video ) )
      resultString += ", Video: " + result.video;
  
  return resultString;
}

function formatResultShort( result )
{
  // Index string may be empty.
  var indexString = "";
  if ( !isEmptyTrimmed( result.index ) )
    indexString += result.index + ". ";
  
  return indexString + result.game;
}

function checkRow( row, formula, query )
{
  var rowIndex      = row[0],
      rowGame       = row[1],
      rowChosenBy   = row[2],
      rowDateBeaten = row[8],
      rowTime       = row[9],
      rowRating     = row[5],
      rowVideo      = formula[14];
  
  function makeResult( exact )
  {
    if ( !isEmptyTrimmed( rowVideo ) ) {
        video = rowVideo.match(/\"(.*)\",/)[1]
    }
    else {
      video = ''
    }
    return {
      exact:      exact,
      index:      rowIndex,
      game:       rowGame,
      chosenBy:   rowChosenBy,
      dateBeaten: formatDate( rowDateBeaten ),
      time:       formatDuration( rowTime ),
      rating:     rowRating,
      // test Extracts URL from HYPERLINK("link", text)
      video:      video

    }
  }
  
    // Filter out games starting with "*" as they are not real games.
  if (asteriskRegex.test ( rowGame )) {
     return;
  }
  
  // If query is an integer, return the game by index.
  // The row index must be an integer also (it's empty for e.g. the taco breaks)
  // Sartan's note: Row number is not the same as game number. There will always be
  // A row index in a sheets document.  See above function instead.
  // The game name must be non-empty.
  if ( integerRegex.test( query ) && integerRegex.test( rowIndex ) )
    if ( parseInt( query, 10 ) === parseInt( rowIndex, 10 ) )
      if ( !isEmptyTrimmed( rowGame ) )
        return makeResult( true );
  
  // Otherwise, check if the query is a substring of the game name or
  // the nickname.
  var queryClean = clean( query );
  if ( clean( rowGame ).indexOf( queryClean ) >= 0 ||
       clean( rowChosenBy ).indexOf( queryClean ) >= 0 )
  {
    return makeResult( false );
  }
  
  // Filter out games starting with "*" as they are not real games.
  
  // Didn't match.
  return;
}

function checkRow_new( row, query )
{
  var rowIndex      = row[0],
      rowGame       = row[1],
      rowBeaten     = row[3],
      rowGenre      = row[4]; 
  var queryClean = clean( query );
  if ( clean( rowGame ).indexOf( queryClean ) >= 0)
  {
    return {
      game: rowGame,
      genre: rowGenre
    }
  }
  
  // Didn't match.
  return;
}

function formatNewResults(results)
{

  newResults = [];
  
 for (var i = 0; i < results.length; ++i)
 {
   var result = results[i];
   newResults.push( result.game + ":" + result.genre + " " );
 }
  return newResults
   
}


function formatLookupResults( results, query )
{
  if ( results.length === 0 ) {
    //results = lookup( query, "Games List" );
    //Logger.log(results);    
    newresults = lookup( query, "Games List" );
    formatted = formatNewResults(newresults)
    Logger.log(formatted + formatted.length)
    if (formatted.length != 0) {
      return twitchIcon + ' ' + query + ' was not beaten, but can be picked!! ' + formatted;
    }
  }
  if (results.length === 0 ) {
    return twitchIcon + ' Sorry, no entry was found for "' + query + '" ' + twitchIcon;
  }
  
  // See if there was an exact result.
  for ( var i = 0; i < results.length; ++i )
  {
    var result = results[i];
    
    // If an exact result (from integer query), return only it.
    if ( result.exact )
      return formatResultLong( result );
  }
  
  // No exact result, build the string from multiple results.
  
  // First result is always long.
  var resultString = formatResultLong( results[0] );
  
  // If there are more results, display only the number and name.
  if ( results.length > 1 )
  {
    var otherStrings = [];
    for ( var i = 1; i < results.length; ++i )
      otherStrings.push( formatResultShort( results[i] ) );
    
    resultsNumber = "result";
    if ( otherStrings.length > 1 )
      resultsNumber += "s";
    resultString += " [" + otherStrings.length + " other " + resultsNumber + ": ";
    
    // Add results until we reach the maximum string length.
    for ( var i = 0; i < otherStrings.length; ++i )
    {
      var string = otherStrings[i];
      // If the new string would push us over the maximum length...
      if ( resultString.length + string.length > MAX_RESULT_LENGTH )
      {
        var numRest = otherStrings.length - i;
        resultString += "(and " + numRest + " more)";
        
        // We're done.
        break;
      }
      
      resultString += string;
      if ( i != otherStrings.length-1 )
        resultString += " - ";
    }
    
    resultString += "]";
  }
 
  return resultString;
}

function lookup( query, sheetname )
{
  var sheet = ss.getSheetByName( sheetname );
  var data = sheet.getDataRange().getValues();
  var formula = sheet.getDataRange().getFormulas();
  var allResults = []
  
  // Sartan: Only send a search if there are more than 1 characters to query.
  if ( clean( query ).length >= 1 )
  {
    // First row is the header, so skip it.
    for ( var i = 1; i < data.length; ++i )
    {
      if ( sheetname == "Games Beaten" ) {
        var rowResult = checkRow( data[i], formula[i], query );
      }
      else if ( sheetname == "Games List") {
        var rowResult = checkRow_new( data[i], query );
      }
      
      if ( rowResult !== undefined )
        allResults.push( rowResult );
    }
  }
  
  return allResults;
}

function doGet( e )
{
  // This test query is used if nothing is passed in "e".
  var TEST_QUERY = "qbert";
  // invite or game
  //var TEST_MODE = 'translate';
  var TEST_MODE = 'game';
  
  var result = "n/a";
  
  // Query must be present to run commands
  if ( e !== undefined ) {
    Logger.log( "Full query: " + e.queryString );

    result = "Invalid action";
    
    if ( e.parameter.action !== undefined )
    {
      if ( e.parameter.action === "game" ) {
        var queryPrefix = 'action=game&query=';
        
        // Sanity check:
        if ( e.queryString.indexOf( queryPrefix ) === 0 )
        {
          // NOTE: This is a hack. Everything after "query=" is considered
          // part of the game query. It's needed because of nightbot's limitations.
          var query = e.queryString.replace( queryPrefix, '' );
          query = decodeURI(query);
          // if lookup(query) is empty here, check the other sheet if a game is still waiting to be patched
          
          result = formatLookupResults( lookup( query, "Games Beaten" ), query );
        }
        else
        {
          result = "Sanity check failed. Hell has frozen over.";
        }
      }
      else if ( e.parameter.action === "invite" ) {
        var username = e.parameter.username;
        var oauth = e.parameter.oauth;
        result = sendInvite( username, oauth );
      }
      else if ( e.parameter.action === "translate" ) {
        var text = e.parameter.text;
        var from = e.parameter.from;
        var to = e.parameter.to;
        result = gtranslate( text, from, to );
      }
    }
  }
  // Sartan: Test Mode
  else {
    if ( TEST_MODE == 'game' ) {
      query = TEST_QUERY;
      result = formatLookupResults( lookup( query, "Games Beaten" ), query );
    }
    else if ( TEST_MODE == 'invite') {
      result = sendInvite( 'bot_sartan', 'invalid_oauth' )
    }
    else if ( TEST_MODE == 'translate') {
      result = gtranslate( 'one two three', "en", "pt" )
    }
  }
  
  Logger.log( "Lookup results: " + result );
  return ContentService.createTextOutput( result );
}


function sendInvite(username, oauth) {

   var payload =
   {
     "irc_channel" : inviteRoom,
     "username" : username
   };

   var options =
   {
     "oauth_token" : oauth,
     "method" : "post",
     "payload" : payload,
     // We want the HTTP code if the request fails.
     "muteHttpExceptions" : true
   };

   var response = UrlFetchApp.fetch("https://chatdepot.twitch.tv/room_memberships?oauth_token=" + oauth, options);
   var err = JSON.parse(response)
   Logger.log(response)
   Logger.log(err)
   
   var code = response.getResponseCode()
   if (code == 401) {
     return "Authorization failure to Twitch Chat Depot, Check script and nightbot oauth: Notify SartanDragonbane - " + err.message
   }
   else if ( code == 200 ) {
     return "Welcome to " + inviteRoomName + " " + username + ", Please refresh Twitch Chat to see the new group above the chat window."                      
   }
  else {
    return "Invite failed. Contact SartanDragonBane or fo__ if this is in error. HTTP Response code: " + code + " Message: " + err.message + " Error: " + err.errors
  }
}

// Language codes available here: https://cloud.google.com/translate/v2/using_rest#language-params
function gtranslate(text, from, to) {
   
  return from + ">" + to + ": " + LanguageApp.translate( text, from, to );
  
}

