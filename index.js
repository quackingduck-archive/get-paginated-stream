// Transform a paginated api endpoint into a readable stream

// Current Restrictions:
//
// * https only
// * Assumes the pages are json encoded arrarys with no pretty formatting

// * However this module doesn't decode the json stream - it just ensures the resulting stream
//   is valid json. Use you favorite streaming json decoder module

// Currently new pages streams fetched only after the previous ones have finished. It would be
// nice to add a bit of I/O parallelism here.

// This was written against GitHub's paginated API and not tested against anything else

var https = require('https')
  , combinedStream = require('combined-stream')
  , trimStream = require('trim-stream')
  , wrapStream = require('wrap-stream')

module.exports = requestPages

function requestPages(reqOptionsForPage) {
  var combinedPageResponses = combinedStream.create()
    , pageNum = 1

  function fetchNextPage(appendToOuputStream) {

    requestPage(reqOptionsForPage(pageNum), function(err, anotherPageAvailable, res){
      if (err) { cs.emit('error', err) ; return }

      appendToOuputStream(
        res
          .pipe(trimStream(1,1))    // remove starting '[' and ']'
          .pipe(wrapStream('',',')) // add trailing ','
      )

      if (!anotherPageAvailable) return // terminating condition

      pageNum++

      combinedPageResponses.append(fetchNextPage)
    })
  }

  combinedPageResponses.append(fetchNextPage)

  return (
    combinedPageResponses
      .pipe(trimStream(0,1))     // remove trailing comma
      .pipe(wrapStream('[',']')) // wrap combined streams with '[' and ']'
  )
}

function requestPage(requestArgs, callback) {
  https.get(requestArgs, function(res) {
    callback(null, (res.headers.link && linksToNextPage(res.headers.link)), res)
  }).on('error', callback)
}

function linksToNextPage(linkHeader) {
  return linkHeader.indexOf('rel="next"') !== -1
}

// ---

// Run with:
//
//    node https-get-paginated-stream | JSONStream '*.name'
//
// * Install JSONStream: npm install -g JSONStream
// * Set GITHUB_API_TOKEN env var if you hit github's public api limit

var runExamples = !module.parent
if (runExamples) {

  function reqOptions(page) {
    var opts = {
      host: 'api.github.com'
    , path: '/users/substack/repos?' + 'repo_type=public&per_page=100&page=' + page
    , headers: {
        'user-agent': 'https-get-paginated-stream'
      , 'accept': 'application/vnd.github.v3.raw'
      }
    }
    if (process.env.GITHUB_API_TOKEN) opts.headers.authorization = 'token ' + process.env.GITHUB_API_TOKEN
    return opts
  }

  requestPages(reqOptions).pipe(process.stdout)
}
