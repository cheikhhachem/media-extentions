const mangayomiSources = [{
    id: 255023163003,
    name: "Risto Anime",
    lang: "ar",
    baseUrl: "https://ristoanime.me",
    apiUrl: "",
    iconUrl: "https://ristoanime.me/favicon.ico",
    typeSource: "single",
    itemType: 1,
    isNsfw: false,
    version: "1.0.1",
    pkgPath: "anime/src/ar/ristoanime.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.userAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
    }

    async html(url, referer = this.source.baseUrl + "/") {
        return (await this.client.get(url, { "User-Agent": this.userAgent, Referer: referer })).body;
    }

    text(value) {
        return (value || "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").trim();
    }

    absolute(url) {
        return url.startsWith("http") ? url : this.source.baseUrl + (url.startsWith("/") ? url : "/" + url);
    }

    parseList(html) {
        const list = [];
        const pattern = /<div[^>]+class=["'][^"']*\bMovieItem\b[^"']*["'][^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?<div[^>]+class=["'][^"']*\bposter\b[^"']*["'][^>]+(?:style|data-style)=["'][^"']*?url\(([^)]+)\)[^"']*["'][^>]*>[\s\S]*?<h4[^>]*>([\s\S]*?)<\/h4>/gi;
        let match;
        while ((match = pattern.exec(html)) !== null) {
            list.push({
                link: this.absolute(match[1]),
                imageUrl: this.absolute(match[2].replace(/["']/g, "").trim()),
                name: this.text(match[3])
            });
        }
        return list;
    }

    async results(query) {
        const html = await this.html(this.source.baseUrl + "/?s=" + encodeURIComponent(query));
        return { list: this.parseList(html), hasNextPage: false };
    }

    async getPopular(page) {
        return this.results("");
    }

    async getLatestUpdates(page) {
        return this.results("");
    }

    async search(query, page, filters) {
        return this.results(query);
    }

    async getDetail(url) {
        const html = await this.html(url);
        const description = this.text((html.match(/<div[^>]+class=["'][^"']*\bStoryArea\b[^"']*["'][^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i) || [null, ""])[1]);
        const episodes = [];
        const pattern = /<a[^>]+href=["']([^"']+)["'][^>]*>\s*الحلقة\s*<em>\s*(\d+)\s*<\/em>/gi;
        let match;
        while ((match = pattern.exec(html)) !== null) {
            let episodeUrl = this.absolute(match[1]);
            episodeUrl += episodeUrl.endsWith("/") ? "watch/" : "/watch/";
            episodes.push({ name: "Episode " + match[2], url: episodeUrl });
        }
        return { description: description, episodes: episodes.reverse() };
    }

    async getVideoList(url) {
        const html = await this.html(url);
        const provider = html.match(/data-watch=["']([^"']*vidmoly[^"']+)["']/i)
            || html.match(/<iframe[^>]+src=["']([^"']*vidmoly[^"']+)["']/i);
        if (!provider) return [];

        const providerUrl = provider[1].replace(/&amp;/g, "&");
        const providerHtml = await this.html(providerUrl, url);
        const stream = providerHtml.match(/\bsources\s*:\s*\[\s*\{\s*file\s*:\s*["'](https?:\/\/[^"']+\.m3u8\?[^"']+)["']/i);
        if (!stream) return [];
        const streamUrl = stream[1].replace(/&amp;/g, "&");
        return [{
            url: streamUrl,
            originalUrl: streamUrl,
            quality: "VidMoly (Adaptive HLS)",
            headers: { "User-Agent": this.userAgent, Referer: providerUrl }
        }];
    }
}
