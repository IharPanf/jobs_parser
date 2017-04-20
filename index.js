var request = require("request");
var cheerio = require("cheerio");
var jsonfile = require('jsonfile');
var async = require('async');
var pCommandLine = require('optimist').argv;
var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');

var urlParse = "https://jobs.tut.by/search/vacancy?area=16&enable_snippets=true" +
    "&text=%D0%BF%D1%80%D0%BE%D0%B3%D1%80%D0%B0%D0%BC%D0%BC%D0%B8%D1%81%D1%82" +
    "&clusters=true&search_field=name&currency_code=BYR&page=";

var counterForParsing = 0;
var LIMIT = pCommandLine.limit || 3;
var PAGELIMIT = pCommandLine.pages || 2;
var file = 'data.json';
var dbName = 'jobs';
var urlDatabase = 'mongodb://localhost:27017/' + dbName;


//Class for creating news object
function Jobs() {
    return {
        "title": null,
        "fullJobsUrl": null,
        "shortDescription": "",
        "fullText": {
            "vacancy_title": null,
            "vacancy_info": [],
            "vacancy_container": null
        },
        "company": null,
        "index": null
    }
}

function parseOnePage(numberOfPage) {
    //TODO Need for some refractoring - split in different functions
    return (function (numberOfPage) {

        function sleep(miliseconds) {
            var currentTime = new Date().getTime();

            while (currentTime + miliseconds >= new Date().getTime()) {
            }
        }

        var listOfJobs = [];
        //TODO Don't sent request if we have limit for records
        request(urlParse + numberOfPage, function (error, response, body) {
            if (!error) {
                var $ = cheerio.load(body);
                $('.search-result-description__item').each(function () {
                    if (counterForParsing < LIMIT) {

                        if ($(".search-result-item__head a", this).text()) {
                            counterForParsing++;
                            var currentJobs = new Jobs();
                            currentJobs.title = $(".search-result-item__head a", this).text();
                            currentJobs.fullJobsUrl = $(".search-result-item__head a", this).attr("href");

                            currentJobs.index = currentJobs.fullJobsUrl.split('?');
                            currentJobs.index = currentJobs.index[0].split('/');
                            currentJobs.index = currentJobs.index[currentJobs.index.length - 1];

                            $(".search-result-item__snippet", this).each(function () {
                                currentJobs.shortDescription += $(this).text();
                            });

                            currentJobs.company = $(".search-result-item__company a", this).text();
                            listOfJobs.push(currentJobs);
                        }

                    }
                });

                //parse full text for news
                async.each(listOfJobs, function (item, callback) {
                    if (item.fullJobsUrl) {
                        request(item.fullJobsUrl, function (error, response, body) {
                            if (!error) {
                                var $ = cheerio.load(body);
                                //sleep(50);
                                item.fullText.vacancy_title = $(".b-vacancy-custom").text();

                                $(".b-vacancy-info td").each(function () {
                                    item.fullText.vacancy_info.push($(this).text());
                                });

                                item.fullText.vacancy_container = $(".b-vacancy-container").text();

/*                                console.log(item.fullText.vacancy_info);
                                console.log(item.fullJobsUrl);*/
                                //save in MongoDB
                                MongoClient.connect(urlDatabase, function (err, db) {
                                    assert.equal(null, err);

                                    var collection = db.collection('jobs_doc');
                                    var curJobs = collection.findOne({index: item.index});

                                    curJobs.then(function (result) {
                                        if (result) { //insert news only in the first time
                                            item = null;
                                        }
                                        db.close();
                                    });
                                });
                            }
                            callback();
                        });
                    }
                }, function (err, result) {
                    //save in json file
                    listOfJobs = listOfJobs.filter(function (item) {
                        return item;
                    });

                    if (listOfJobs) {
                        /*jsonfile.writeFile(file, listOfJobs, function () {
                            console.log('............Ready!');
                        });*/

                        MongoClient.connect(urlDatabase, function (err, db) {
                            assert.equal(null, err);
                            if (listOfJobs.length > 0) {
                                insertDocuments(db, listOfJobs, function (results) {
                                    db.close();
                                })
                            } else {
                                db.close();
                            }
                        });
                    }
                });
            } else {
                console.log("Error: " + error);
            }
        });
    })(numberOfPage, counterForParsing);
}

//Run parser script
for (var i = 0; i < PAGELIMIT; i++) {
    parseOnePage(i);
}

var insertDocuments = function (db, listOfJobs, callback) {
    // Get the documents collection
    var collection = db.collection('jobs_doc');
    // Insert some documents
    collection.insertMany(listOfJobs, function (err, result) {
        assert.equal(err, null);
        callback(result);
    });
};
