const fetch = require('node-fetch');
const LoggerAdapter = require('./common/LoggerAdapter');
const utils = require('./common/utils');

const TIMES_LIMIT_RETRY = 10;
const DEFAULT_RATE_LIMITS_MINUTE = 50;
//const DEFAULT_RATE_LIMITS_HOUR = DEFAULT_RATE_LIMITS_MINUTE * 15;

const QUIP_HTTP_HEADER_RATE_LIMIT_LIMIT = 'x-ratelimit-limit';
const QUIP_HTTP_HEADER_RATE_LIMIT_REMAINING = 'x-ratelimit-remaining';
const QUIP_HTTP_HEADER_RATE_LIMIT_RESET = 'x-ratelimit-reset';
//const QUIP_HTTP_HEADER_RATE_LIMIT_COMPANY_LIMIT = 'x-company-ratelimit-limit';
//const QUIP_HTTP_HEADER_RATE_LIMIT_COMPANY_REMAINING = 'x-company-ratelimit-remaining';
//const QUIP_HTTP_HEADER_RATE_LIMIT_COMPANY_RESET = 'x-company-ratelimit-reset';
//const QUIP_HTTP_HEADER_COMPANY_RETRY_AFTER = 'x-company-retry-after';

const HTTP_RETRY_CODES = [500, 503, 504, 429];

class QuipService {
    constructor(accessToken, apiURL='https://platform.quip.com:443/1') {
        this.accessToken = accessToken;
        this.apiURL = apiURL;
        this.logger = new LoggerAdapter();
        this.queriesRetry = new Map();
        this.waitingMs = this._calculateWaitingInMs();
        this.delayCalls = false;
        this.stats = {
            query_count: 0,
            getThread_count: 0,
            getThreads_count: 0,
            getFolder_count: 0,
            getFolders_count: 0,
            getBlob_count: 0,
            getPdf_count: 0,
            getXlsx_count: 0,
            getDocx_count: 0,
            getCurrentUser_count: 0,
            getThreadMessages_count: 0,
            getUser_count: 0
        };
        this.rateLimitResetMs = Date.now();
        this.rateLimitRemaining = DEFAULT_RATE_LIMITS_MINUTE;
        this.rateLimitLimit = DEFAULT_RATE_LIMITS_MINUTE;
    }

    setLogger(logger) {
        this.logger = logger;
    }

    setWaitingMs(minuteRateLimits) {
        this.waitingMs = this._calculateWaitingInMs(minuteRateLimits);
    }

    setForceDelay(){
        this.delayCalls = true;
    }

    async checkUser() {
        this.stats.getCurrentUser_count++;

        const res = await fetch(`${this.apiURL}/users/current`, this._getOptions('GET'));
        if(res.ok) return true;

        return false;
    }

    async getUser(userIds) {
        this.stats.getUser_count++;
        return this._apiCallJson(`/users/${userIds}`);
    }

    async getCurrentUser() {
        this.stats.getCurrentUser_count++;
        return this._apiCallJson('/users/current');
    }

    async getFolder(folderId) {
        this.stats.getFolder_count++;
        return this._apiCallJson(`/folders/${folderId}`);
    }

    async getThread(threadId) {
        this.stats.getThread_count++;
        return this._apiCallJson(`/threads/${threadId}`);
    }

    async getThreadMessages(threadId) {
        this.stats.getThreadMessages_count++;
        return this._apiCallJson(`/messages/${threadId}`);
    }

    async getThreads(threadIds) {
        this.stats.getThreads_count++;
        return this._apiCallJson(`/threads/?ids=${threadIds}`);
    }

    async getFolders(threadIds) {
        this.stats.getFolders_count++;
        return this._apiCallJson(`/folders/?ids=${threadIds}`);
    }

    async getBlob(threadId, blobId) {
        //const random = (Math.random() > 0.8) ? 'random' : '';
        this.stats.getBlob_count++;
        return this._apiCallBlob(`/blob/${threadId}/${blobId}`);
    }

    async getPdf(threadId) {
        this.stats.getPdf_count++;
        return this._apiCallBlob(`/threads/${threadId}/export/pdf`);
    }

    async getDocx(threadId) {
        this.stats.getDocx_count++;
        return this._apiCallBlob(`/threads/${threadId}/export/docx`);
    }

    async getXlsx(threadId) {
        this.stats.getXlsx_count++;
        return this._apiCallBlob(`/threads/${threadId}/export/xlsx`);
    }

    async createExportPdfRequest(threadId) {
        return await this._apiCallJson(`/threads/${threadId}/export/pdf/async`, 'POST', {});
    }

    async retrieveExportPdfResponse(threadId, requestId) {
        let response = await this._apiCallJson(`/threads/${threadId}/export/pdf/async?request_id=${requestId}`);

        if(response) {
            const status = response.status;
            console.log(`PDF exporting request [${requestId}] for [${threadId}] is ${status}`);
            if('PROCESSING' === status) {
                //await this._delay(60000);
                return await this.retrieveExportPdfResponse(threadId, requestId);
            }

            if('SUCCESS' === status || 'PARTIAL_SUCCESS' === status) {
                return response;
            }
        }

        return;
    }

    async download(url) {
        let response = {};
        try{
            response = await fetch(`${url}`, this._getOptions('GET'));
        }catch(err) {
            if(this._httpCallRetryable(url)){
                this._delay(this.waitingMs);
                return await this.download(url);
            }else {
                this.logger.error(`Couldn't download [${url}], tryed to get it ${TIMES_LIMIT_RETRY} times`);
            }
        }
        return response;
    }

    async exportToPDF(threadId) {
        let exportRequest = await this.createExportPdfRequest(threadId);

        if(exportRequest) {
            
            let response = await this.retrieveExportPdfResponse(threadId, exportRequest.request_id);

            if(response) {
                console.log(`PDF URL ${response.pdf_url}`);
                let pdfRespone = await this.download(`${response.pdf_url}`);
                if(pdfRespone.ok) {
                    return await pdfRespone.blob();
                }
            }
        }

        return;
    }

    async _apiCallBlob(url, method = 'GET', options = {}) {
        return this._apiCall(url, method, true, options);
    }

    async _apiCallJson(url, method = 'GET', options = {}) {
        return this._apiCall(url, method, false, options);
    }

    async _apiCall(url, method, blob, options = {}) {
        this.stats.query_count++;

        if(this.rateLimitRemaining <= 0){
            //console.log(`Delayed`);
            return await this._apiCallInDelay(url, method, blob, this.waitingMs, options); 
        }

        if(this.delayCalls === true){
            //console.log(`\r\nDelayed Call in ${ (1*this.waitingMs)/1000} s `);
            return await this._apiCallInDelay(url, method, blob, this.waitingMs, options);
        }else {
            //console.log(`\r\nImediate Call`);
            return await this._executeApiCall(url, method, blob, options);
        }
    }

    async _delay(waitingMs = this.waitingMs) {
        return new Promise(resolve => {
            setTimeout(resolve, waitingMs);
        });
    }

    async _apiCallInDelay(url, method, blob, waitingMs, options) {
        await this._delay(waitingMs);
        return await this._executeApiCall(url, method, blob, options);
    }

    async _executeApiCall(url, method, blob, options = {}) {
        console.log(`\r\nExecute API Call: url ${url}, method ${method}, blob ${blob}, options ${options}`);
        try {
            const res = await fetch(`${this.apiURL}${url}`, Object.assign(this._getOptions(method), options));

            return await this._handleApiCallResponse(res, url, method, blob, options);
            
        } catch (e) {
            console.log(`Couldn't fetch: ${url} ==> ${JSON.stringify(e)}`);   
            this.logger.error(`Line 225: Couldn't fetch [${this.apiURL}${url}], ${JSON.stringify(e)}`);
            return;
        }
    }

    async _handleApiCallResponseError(res, url, method, blob, options = {}) {
        //
        if(this._httpCodeRetryable(res.status)) {
            const currentTime = new Date().getTime();
            const rateLimitReset = this.rateLimitResetMs;
            let waitingInMs = this.waitingMs;
            if(rateLimitReset > currentTime) {
                waitingInMs += (rateLimitReset - currentTime);
            }
            console.log(`\r\nExecute API Call Failed [${res.status}]: [${method}], waiting in MS [${waitingInMs}]`);
            console.log(`\r\nReset : ${res.headers.get(QUIP_HTTP_HEADER_RATE_LIMIT_RESET)} - Body: [${await res.json()}]`);
            
            this.logger.debug(`Retry HTTP ${res.status}: for ${url}, waiting in ms: ${waitingInMs}`);
            if(this._httpCallRetryable(url)) {
                return await this._apiCallInDelay(url, method, blob, waitingInMs, options);
            } else {
                console.log(`\r\nCouldn't fetch ${url}, tryed to get it ${TIMES_LIMIT_RETRY} times`);
                this.logger.error(`Line 247: Couldn't fetch ${url}, tryed to get it ${TIMES_LIMIT_RETRY} times`);
                return;
            }
        } else {
            console.log(`\r\nCouldn't fetch ${url}, received ${res.status}`);
            this.logger.debug(`Line 252: Couldn't fetch ${this.apiURL}${url}, received ${res.status}`);
            return;
        }
    }

    async _handleApiCallResponse(res, url, method, blob, options) {
        //
        console.log(`\r\nApi Call Response Status: ${res.status}`);

        const headers = this._extractHeaders(res);

        this.rateLimitLimit = headers.rateLimitLimit;
        this.rateLimitRemaining = headers.rateLimitRemaining;
        this.rateLimitResetMs = headers.rateLimitResetMs;

        console.log(`Rate Limit: Limit: [${headers.rateLimitLimit}] - Reset: [${headers.rateLimitResetMs} ] - Remaining: [${headers.rateLimitRemaining}]`);

        if(!res.ok) {
            return await this._handleApiCallResponseError(res, url, method, blob, options);
        }

        if(blob) {
            return res.blob();
        } else {
            return res.json();
        }
    }

    _httpCodeRetryable(code) {
        return HTTP_RETRY_CODES.includes(code);
    }

    _httpCallRetryable(url) {
        let count = this.queriesRetry.get(url);
        if(!count) {
            count = 0;
        }

        this.queriesRetry.set(url, ++count);
        if(count > TIMES_LIMIT_RETRY) {
            return false;
        }

        return true;
    }

    _getOptions(method) {
        return {
            method: method,
            headers: {
                'Authorization': 'Bearer ' + this.accessToken,
                'Content-Type': 'application/json'
            }
        };
    }

    _calculateWaitingInMs(minuteRateLimits = DEFAULT_RATE_LIMITS_MINUTE) {
        return 60 / Math.floor((minuteRateLimits * 15) / 60 ) * 1000
    }

    _extractHeaders(res) {
        return {
            rateLimitLimit: utils.normalizeInteger(res.headers.get(QUIP_HTTP_HEADER_RATE_LIMIT_LIMIT)),
            rateLimitRemaining: utils.normalizeInteger(res.headers.get(QUIP_HTTP_HEADER_RATE_LIMIT_REMAINING)),
            rateLimitResetMs: utils.normalizeInteger(res.headers.get(QUIP_HTTP_HEADER_RATE_LIMIT_RESET)) * 1000,
        };
    }
}

module.exports = QuipService;