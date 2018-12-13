// dependencies
var async = require('async');
var AWS = require('aws-sdk');
var gm = require('gm')
            .subClass({ imageMagick: true }); // Enable ImageMagick integration.
var util = require('util');
var http = require('http');
const fs = require('fs');

let graduationDate = new Date("04/25/2019"),
    today = new Date(),
    timeDifference = Math.abs(graduationDate.getTime() - today.getTime());
    
let daysUntilGraduation = Math.ceil(timeDifference / (1000 * 3600 * 24));

// constants
var MAX_WIDTH  = 300;
var MAX_HEIGHT = 300;

// get reference to S3 client 
var s3 = new AWS.S3();

 
exports.handler = function(event, context, callback) {
    // Read options from the event.
    console.log("Reading options from event:\n", util.inspect(event, {depth: 5}));
    var srcBucket = event.Records[0].s3.bucket.name;
    // Object key may have spaces or unicode non-ASCII characters.
    var srcKey    =
    decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));  
    var dstBucket = "tmeservy-gradannouncements";
    var dstKey    = "GradAnnouncement-" + srcKey;

    // Sanity check: validate that source and destination are different buckets.
    if (srcBucket == dstBucket) {
        callback("Source and destination buckets are the same.");
        return;
    }

    // Infer the image type.
    var typeMatch = srcKey.match(/\.([^.]*)$/);
    if (!typeMatch) {
        callback("Could not determine the image type.");
        return;
    }
    var imageType = typeMatch[1];
    if (imageType != "jpg" && imageType != "png") {
        callback('Unsupported image type: ${imageType}');
        return;
    }

    //download file from the internet
        // Download the image from S3, transform, and upload to a different S3 bucket.
        async.waterfall([
            function downloadFromS3(next) {
                // Download the image from S3 into a buffer.
                s3.getObject({
                        Bucket: srcBucket,
                        Key: srcKey
                    },
                    next);
            },
            function transformS3Image(response, next) {
                //gm(response.Body).size(function(err, size) {
                gm(response.Body).size(function(err, size) {
                    // Infer the scaling factor to avoid stretching the image unnaturally.
                    var scalingFactor = Math.min(
                        MAX_WIDTH / size.width,
                        MAX_HEIGHT / size.height
                    );
                    var width  = scalingFactor * size.width;
                    var height = scalingFactor * size.height;
                    
                    //date calculation
    
                    // Transform the image buffer in memory.
                    this.resize(width, height).sepia().borderColor('Red').border(20,20)
                        .fill('white')
                        .fontSize(14)
                        .drawText(0, 0, "Guess who is graduating in " + daysUntilGraduation + " days?", 'South')
                        .toBuffer(imageType, function(err, buffer) {
                            if (err) {
                                next(err);
                            } else {
                                next(null, response.ContentType, buffer);
                            }
                        });
                });
            },
            function uploadS3(contentType, data, next) {
                // Stream the transformed image to a different S3 bucket.
                s3.putObject({
                        Bucket: dstBucket,
                        Key: dstKey,
                        Body: data,
                        ContentType: contentType
                    },
                    next);
                }
            ], function (err) {
                if (err) {
                    console.error(
                        'Unable to resize ' + srcBucket + '/' + srcKey +
                        ' and upload to ' + dstBucket + '/' + dstKey +
                        ' due to an error: ' + err
                    );
                } else {
                    console.log(
                        'Successfully resized ' + srcBucket + '/' + srcKey +
                        ' and uploaded to ' + dstBucket + '/' + dstKey
                    );
                }
    
                callback(null, "message");
            }
        );

    
};




