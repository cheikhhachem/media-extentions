const BASE_URL = "https://animesonline.cloud";
const USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const PLAYER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";
let CRYPTO_JS_PROMISE = null;

async function getText(url, referer) {
    const response = await fetchv2(url, {
        "User-Agent": USER_AGENT,
        "Referer": referer || BASE_URL + "/"
    });
    return response.text();
}

function text(value) {
    return (value || "")
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
        .replace(/&quot;/g, "\"").replace(/&#039;|&apos;/g, "'")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function attribute(tag, name) {
    const match = (tag || "").match(new RegExp("\\b" + name + "=[\\\"']([^\\\"']+)[\\\"']", "i"));
    return match ? text(match[1]) : "";
}

async function searchResults(keyword) {
    try {
        const html = await getText(BASE_URL + "/?s=" + encodeURIComponent(keyword));
        const results = [];
        const pattern = /<div\b[^>]*class=["'][^"']*\bresult-item\b[^"']*["'][^>]*>([\s\S]*?)<\/article>\s*<\/div>/gi;
        let match;

        while ((match = pattern.exec(html)) !== null) {
            const link = match[1].match(/<div\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>\s*<a\b[^>]*href=["']([^"']*\/anime\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
            const imageTag = (match[1].match(/<div\b[^>]*class=["'][^"']*\bthumbnail\b[^"']*["'][^>]*>[\s\S]*?(<img\b[^>]*>)/i) || [])[1];
            if (link) {
                results.push({
                    title: text(link[2]),
                    image: attribute(imageTag, "data-lazy-src") || attribute(imageTag, "src"),
                    href: link[1]
                });
            }
        }
        return JSON.stringify(results);
    } catch (error) {
        console.log("Animes Online search error: " + error);
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const html = await getText(url);
        const description = text((html.match(/\bid=["']info["'][\s\S]*?<div\b[^>]*class=["'][^"']*\bwp-content\b[^"']*["'][^>]*>[\s\S]*?<p\b[^>]*>([\s\S]*?)<\/p>/i) || [])[1]);
        const alias = text((html.match(/<a\b[^>]*href=["'][^"']*\/nome-alternativo\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i) || [])[1]);
        const airdate = text((html.match(/<span\b(?=[^>]*class=["'][^"']*\bdate\b)(?=[^>]*itemprop=["']dateCreated["'])[^>]*>([\s\S]*?)<\/span>/i) || [])[1]);
        return JSON.stringify([{
            description: description || "No description available",
            aliases: alias || "N/A",
            airdate: airdate || "Unknown"
        }]);
    } catch (error) {
        console.log("Animes Online details error: " + error);
        return JSON.stringify([]);
    }
}

async function extractEpisodes(url) {
    try {
        const html = await getText(url);
        const episodes = [];
        const pattern = /<div\b(?=[^>]*class=["'][^"']*\bepisode-card\b)(?=[^>]*data-episode-number=(?:"(\d+)"|'(\d+)'))(?=[^>]*data-episode-title=(?:"([^"]*)"|'([^']*)'))[^>]*>\s*<a\b[^>]*href=["']([^"']*\/episodio\/[^"']+)["'][^>]*>\s*(<img\b[^>]*>)/gi;
        let match;

        while ((match = pattern.exec(html)) !== null) {
            episodes.push({
                href: match[5],
                number: Number(match[1] || match[2]),
                title: text(match[3] || match[4]),
                image: attribute(match[6], "data-lazy-src") || attribute(match[6], "src")
            });
        }
        episodes.sort((a, b) => a.number - b.number);
        return JSON.stringify(episodes);
    } catch (error) {
        console.log("Animes Online episodes error: " + error);
        return JSON.stringify([]);
    }
}

async function cryptoJs() {
    if (!CRYPTO_JS_PROMISE) {
        CRYPTO_JS_PROMISE = (async () => {
            const response = await fetchv2("https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js");
            const load = new Function("module", "exports", "define", await response.text() + ";return this.CryptoJS;");
            return load();
        })();
    }
    return CRYPTO_JS_PROMISE;
}

async function p2pStream(embedUrl) {
    const match = embedUrl.match(/^(https:\/\/(?:animeshd\.cloud|animes\.strp2p\.com))\/#([^&]+)/i);
    if (!match) return "";
    const response = await getText(
        match[1] + "/api/v1/video?id=" + encodeURIComponent(match[2]) + "&w=390&h=844&r=animesonline.cloud",
        embedUrl
    );
    const crypto = await cryptoJs();
    const plaintext = crypto.AES.decrypt(
        { ciphertext: crypto.enc.Hex.parse(response.trim()) },
        crypto.enc.Utf8.parse("kiemtienmua911ca"),
        { iv: crypto.enc.Utf8.parse("1234567890oiuytr"), mode: crypto.mode.CBC, padding: crypto.pad.Pkcs7 }
    ).toString(crypto.enc.Utf8);
    const data = JSON.parse(plaintext);
    let streamUrl = data.cfNative || data.source || data.cf || "";
    if (streamUrl.includes("/v4/") && data.pk && data.pk.k && !/[?&]k=/.test(streamUrl)) {
        streamUrl += (streamUrl.includes("?") ? "&" : "?") + "k=" + encodeURIComponent(data.pk.k) + "&kx=" + encodeURIComponent(data.pk.kx);
    }
    return streamUrl;
}

async function bloggerStreams(embedUrl, label) {
    const token = decodeURIComponent(((embedUrl.match(/[?&]token=([^&]+)/) || [])[1]) || "");
    if (!token) return [];
    const page = await fetchv2(embedUrl, { "User-Agent": PLAYER_USER_AGENT, "Referer": BASE_URL + "/" });
    const html = await page.text();
    const sid = (html.match(/"FdrFJe":"([^"]+)/) || [])[1];
    const build = (html.match(/"cfb2h":"([^"]+)/) || [])[1];
    if (!sid || !build) return [];

    const request = JSON.stringify([[[
        "WcwnYd",
        JSON.stringify([token, null, 0]),
        null,
        "generic"
    ]]]);
    const endpoint = "https://www.blogger.com/_/BloggerVideoPlayerUi/data/batchexecute"
        + "?rpcids=WcwnYd&source-path=%2Fvideo.g&f.sid=" + encodeURIComponent(sid)
        + "&bl=" + encodeURIComponent(build) + "&hl=en-US&_reqid=1&rt=c";
    const response = await fetchv2(endpoint, {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": PLAYER_USER_AGENT,
        "Referer": embedUrl
    }, "POST", "f.req=" + encodeURIComponent(request) + "&");
    const line = (await response.text()).split("\n").find((value) => value.startsWith("[[\"wrb.fr\""));
    if (!line) return [];
    const envelope = JSON.parse(line);
    if (!envelope[0] || !envelope[0][2]) return [];
    const payload = JSON.parse(envelope[0][2]);
    if (!payload || !payload[2]) return [];
    return (payload[2] || []).map((source) => ({
        title: label + (Number((source[1] || [])[0]) === 22 ? " 720p" : " 360p"),
        streamUrl: source[0],
        headers: { "Referer": "https://youtube.googleapis.com/" }
    }));
}

async function resolvePlayer(option, episodeUrl) {
    try {
        const response = await fetchv2(BASE_URL + "/wp-json/dooplayer/v2/" + option.post + "/" + option.type + "/" + option.number, {
            "User-Agent": USER_AGENT,
            "Referer": episodeUrl
        });
        const player = await response.json();
        const embedUrl = player.embed_url || "";
        const source = embedUrl.match(/[?&]source=([^&]+)/i);

        if (source) {
            // These MP4s use an hev1 tag that AVPlayer exposes as audio-only.
            if (/fullhd\s*\/\s*hls/i.test(option.label)) return [];
            const streamUrl = decodeURIComponent(source[1]);
            const probe = await fetchv2(streamUrl, {
                "User-Agent": USER_AGENT,
                "Referer": BASE_URL + "/",
                "Range": "bytes=0-1"
            });
            const body = await probe.text();
            if ((probe.status && probe.status !== 200 && probe.status !== 206) || /<html/i.test(body)) return [];
            return [{ title: option.label, streamUrl: streamUrl, headers: { "Referer": BASE_URL + "/" } }];
        }

        const p2pUrl = await p2pStream(embedUrl);
        if (p2pUrl) {
            const origin = (embedUrl.match(/^https?:\/\/[^/]+/) || [BASE_URL])[0];
            const provider = origin.includes("animeshd.cloud") ? "AnimesHD" : "STRP2P";
            return [{ title: option.label + " HLS (" + provider + ")", streamUrl: p2pUrl, headers: { "Referer": origin + "/" } }];
        }

        if (/blogger\.com\/video/i.test(embedUrl)) return await bloggerStreams(embedUrl, option.label);
    } catch (error) {
        console.log("Animes Online provider " + option.label + " error: " + error);
    }
    return [];
}

async function extractStreamUrl(url) {
    try {
        const html = await getText(url);
        const options = [];
        const pattern = /<li\b(?=[^>]*class=["'][^"']*\bdooplay_player_option\b)(?=[^>]*data-post=["'](\d+)["'])(?=[^>]*data-type=["']([^"']+)["'])(?=[^>]*data-nume=["']([^"']+)["'])[^>]*>([\s\S]*?)<\/li>/gi;
        let match;

        while ((match = pattern.exec(html)) !== null) {
            options.push({
                post: match[1],
                type: match[2],
                number: match[3],
                label: text((match[4].match(/<span\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) || [])[1]) || "Server " + match[3]
            });
        }
        const streams = [];
        for (const group of await Promise.all(options.map((option) => resolvePlayer(option, url)))) {
            for (const stream of group) {
                if (!streams.some((item) => item.streamUrl === stream.streamUrl)) streams.push(stream);
            }
        }
        return JSON.stringify({ streams: streams, subtitles: "" });
    } catch (error) {
        console.log("Animes Online stream error: " + error);
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}
