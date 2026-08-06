const mangayomiSources = [{
    id: 255023163001,
    name: "Aflam",
    lang: "ar",
    baseUrl: "https://aflaam.com",
    apiUrl: "",
    iconUrl: "https://aflaam.com/favicon.png",
    typeSource: "single",
    itemType: 1,
    isNsfw: false,
    version: "1.0.3",
    pkgPath: "anime/src/ar/aflaam.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.headers = {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
        };
    }

    async html(url) {
        return (await this.client.get(url, this.headers)).body;
    }

    text(value) {
        const text = (value || "").replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").trim();
        if (!/[ØÙÃÂ\u0080-\u009f]/.test(text)) return text;
        try {
            return decodeURIComponent(Array.from(text).map(character => {
                const code = character.charCodeAt(0);
                return code < 256 ? "%" + code.toString(16).padStart(2, "0") : encodeURIComponent(character);
            }).join(""));
        } catch (_) {
            return text;
        }
    }

    parseList(html) {
        const list = [];
        const pattern = /<a href="(https?:\/\/aflaam\.com\/(?:movie|series)\/[^\"]+)" class="box">[\s\S]*?<img[^>]+src="([^"]+)"[\s\S]*?<h3[^>]+class="entry-title[^\"]*"[^>]*>([\s\S]*?)<\/h3>/g;
        let match;
        while ((match = pattern.exec(html)) !== null) {
            list.push({ link: match[1], imageUrl: match[2], name: this.text(match[3]) });
        }
        return list;
    }

    async page(url) {
        return { list: this.parseList(await this.html(url)), hasNextPage: false };
    }

    async getPopular(page) {
        return this.page(this.source.baseUrl + "/search?q=");
    }

    async getLatestUpdates(page) {
        return this.page(this.source.baseUrl + "/search?q=");
    }

    async search(query, page, filters) {
        return this.page(this.source.baseUrl + "/search?q=" + encodeURIComponent(query));
    }

    async getDetail(url) {
        const html = await this.html(url);
        const plot = (html.match(/id="movie-tab-2"[\s\S]*?<div class="widget-body">\s*<p[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/i) || [null, ""])[1];
        const meta = (html.match(/<meta property="og:description" content="([^"]*)"/i) || [null, ""])[1];
        const description = this.text(plot || meta);
        const episodes = [];
        if (url.includes("/movie/")) {
            episodes.push({ name: "Movie", url: url });
        } else {
            const pattern = /<a href="(https?:\/\/aflaam\.com\/episode\/[^\"]+)" class="d-block box">[\s\S]*?<h3[^>]+class="entry-title[^\"]*"[^>]*>\s*<span[^>]*>(\d+)<\/span>([\s\S]*?)<\/h3>/g;
            let match;
            while ((match = pattern.exec(html)) !== null) {
                episodes.push({ name: "Episode " + match[2] + " - " + this.text(match[3]), url: match[1] });
            }
        }
        return { description: description, episodes: episodes.reverse() };
    }

    async getVideoList(url) {
        let html = await this.html(url);
        if (!/<video[^>]+id="player"/i.test(html)) {
            const watchUrl = (html.match(/<a href="([^"]+)"\s+class="link-show/) || [null, ""])[1];
            if (!watchUrl) return [];
            html = await this.html(watchUrl);
        }

        const videos = [];
        const pattern = /<source\b[^>]*>/gi;
        let source;
        while ((source = pattern.exec(html)) !== null) {
            const src = (source[0].match(/src="([^"]+)"/) || [null, ""])[1];
            const size = (source[0].match(/size="([^"]+)"/) || [null, ""])[1];
            if (src) videos.push({ url: src, originalUrl: src, quality: "Aflam " + (size || "MP4") + "p" });
        }
        return videos;
    }
}
