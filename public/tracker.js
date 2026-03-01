
(function () {
    function getCookie(name) {
        try {
            var v = document.cookie.match('(^|;) ?' + name + '=([^;]*)(;|$)');
            return v ? v[2] : null;
        } catch (e) { return null; }
    }

    function setCookie(name, value, days) {
        var d = new Date();
        d.setTime(d.getTime() + 24 * 60 * 60 * 1000 * days);
        document.cookie = name + "=" + value + ";path=/;domain=.dreamplaypianos.com;max-age=" + (days * 24 * 60 * 60) + ";SameSite=Lax;Secure";
    }

    function generateUUID() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    var sessionId = getCookie('dp_session_id');
    if (!sessionId) {
        sessionId = generateUUID();
        setCookie('dp_session_id', sessionId, 365);
    }

    function getQueryParam(name) {
        try {
            var match = RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
            return match && decodeURIComponent(match[1].replace(/\+/g, ' '));
        } catch (e) { return null; }
    }

    var emailParam = getQueryParam('em');
    if (emailParam) {
        setCookie('dp_user_email', emailParam, 365);
    }
    var userEmail = getCookie('dp_user_email');

    // --- CAPTURE UTMS & REFERRER ---
    var currentUtms = {};
    try {
        var utms = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
        utms.forEach(function (utm) {
            var val = getQueryParam(utm);
            if (val) sessionStorage.setItem('dp_' + utm, val);
            var stored = sessionStorage.getItem('dp_' + utm);
            if (stored) currentUtms[utm] = stored;
        });

        var referrer = document.referrer;
        if (referrer && referrer.indexOf(window.location.hostname) === -1 && referrer.indexOf('localhost') === -1) {
            if (!sessionStorage.getItem('dp_initial_referrer')) {
                sessionStorage.setItem('dp_initial_referrer', referrer);
            }
        }
    } catch (e) { }
    var initialReferrer = null;
    try { initialReferrer = sessionStorage.getItem('dp_initial_referrer'); } catch (e) { }

    const ENDPOINT = 'https://data.dreamplaypianos.com/api/track';

    // NOTE: If testing locally (localhost dashboard), it won't receive events unless the script points to localhost 
    // OR if you deploy this app to data.dreamplaypianos.com. 
    // User said "I need to... visit ... and watch the counter go up".
    // This implies the dashboard is observing the REAL DB. 
    // So if I run the dashboard LOCALLY, and visit the REAL site, I see numbers. 
    // This script is for the deployed sites.

    function sendEvent(eventName, metadata = {}) {
        if (userEmail && !metadata.email) {
            metadata.email = userEmail;
        }

        // Attach UTMs and referrer
        try {
            Object.assign(metadata, currentUtms);
            if (initialReferrer) metadata.referrer = initialReferrer;
        } catch (e) { }

        const payload = {
            eventName: eventName,
            path: window.location.href,
            sessionId: sessionId,
            metadata: metadata,
            timestamp: new Date().toISOString()
        };

        console.log('[Dreamplay Analytics] Sending event:', eventName, payload);

        fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true
        }).then(res => {
            if (!res.ok) {
                console.error('[Dreamplay Analytics] Server error:', res.status, res.statusText);
            } else {
                console.log('[Dreamplay Analytics] Event sent successfully');
            }
        }).catch(function (err) {
            console.error('[Dreamplay Analytics] Network error:', err);
        });
    }

    window.dreamplay = window.dreamplay || {};
    window.dreamplay.track = sendEvent;

    if (document.readyState === 'complete') {
        sendEvent('pageview');
    } else {
        window.addEventListener('load', function () {
            sendEvent('pageview');
        });
    }

    // --- TIME ON PAGE TRACKING (Exit Beacon) ---
    var pageLoadTime = Date.now();
    var hasSentLeave = false;

    function sendLeaveEvent() {
        if (hasSentLeave) return;
        var duration = Math.round((Date.now() - pageLoadTime) / 1000);

        // Ignore instant 0-second bot bounces
        if (duration > 1) {
            sendEvent('page_leave', { duration_seconds: duration });
            hasSentLeave = true;
        }
    }

    // Modern exit tracking (handles tab switch, tab close, phone lock)
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') {
            sendLeaveEvent();
        }
    });

    // Fallback for older browsers
    window.addEventListener('pagehide', sendLeaveEvent);
})();
