const path = require("path");
const { existsSync, rm } = require("fs")
const { exec, fork } = require("child_process");

module.exports = class Utils {

    constructor(main) {
        this.main = main;
        this.config = this.main.config;
    }

    async sleep(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        })
    }

    get dir() {
		return `${path.dirname(require.main.filename).replaceAll("\\", "/")}/`;
	}

    get repo_dir() {
		return this.dir + "repo/";
	}

    get_repo_name(url = this.config.repo) {
        const match = url.match(/(https?:\/{2}github\.com\/.+?\/([^\/]+))\/?/);
        if (match) return match[1];
        else throw "Repository not provided or does not match expected format.";
    }

    async get_version(cwd = this.repo_dir, remote = false) {
        return this.execute(`git describe --abbrev=7 --always  --long --match v* ${remote ? "origin/" : ""}${this.config.branch}`, { cwd }).catch(console.warn);
    }

    async validate_config() {
        const repo = this.config.repo.match(/(https?:\/{2}github\.com\/.+?\/([^\/]+))\/?/);
        if (!this.config.repo) throw "Github repository not provided!";
        else this.config.repo = repo[1];

        if (!this.config.branch) throw "Github branch not provided!";
        if (!this.config.start) throw "Start command not provided!";
    }

    match_version(cwd = this.repo_dir) {
        return new Promise(async (resolve, reject) => {
            await exec("git remote update", { cwd }).catch(console.error)
            const remote = await this.get_version(cwd, true)
            const local = await this.get_version(cwd, false)
            console.log(`Versions | Remote: ${remote} - Local: ${local}`)
            if (remote === local) resolve("Remote version matches local repository.")
            else reject("Remote does not match local repository.")
        })
    }

    match_origin(cwd = this.repo_dir) {
        return new Promise((resolve, reject) => {
            this.execute("git remote get-url origin", { cwd }).catch(console.error)
            .then((origin) => {
                if (origin !== this.config.repo) reject("Origin does not match local repository.")
                else resolve("Origin matches local repository.")
            })
        })
    }

    async fork_app(cwd = this.repo_dir) {
        return fork(cwd, this.config.start.split(/ +/g));
    }
    
    async clone(repo = this.config.repo, cwd = this.dir) {
        return this.execute(`git clone ${repo} repo`, { cwd }).then(console.log);
    }

    async execute(command, options = {}) {
        return new Promise((resolve, reject) => {
            console.log(`Executing '${command}'...`);
            exec(command, options, (err, stdout, stderr) => {
                if (err) reject(err)
                else if (stderr) reject(stderr);
                else resolve(stdout.trim());
            })
        })
    }

    remove_dir(dir = this.repo_dir) {
        if (this.repo_exists(this.repo_dir)) {
            console.log("Outdated repository present. Deleting...")
            return rm(dir, { recursive: true, force: true }, (err) => {
                if (err) console.error(err);
                else console.log("Successfully removed existing repository.")
            });
        }
    }

    repo_exists(dir = this.repo_dir) {
        return existsSync(dir);
    }

    async reset_app() {
        const { app } = this.main;
        if (app) {
            console.log("App alive. Killing...")
            if (app.kill()) console.log("App terminated successfully.")
            else console.warn("Something went wrong while terminating app during runtime.")
        }
        this.remove_dir();
        console.log("Cloning up-to-date repository...")
        await this.clone(this.config.repo).then(() => console.log("Repository cloned successfully.")).catch(() => {});
    }

    async scan() {
        return new Promise(async (resolve) => {
            const { app } = this.main;
            if (!this.repo_exists()) await this.reset_app();
            else {
                await this.match_origin(this.repo_dir)
                .then(() => this.match_version().catch(() => this.reset_app()).then(console.log))
                .catch(() => this.reset_app())
            }

            if (!app) this.main.app = this.fork_app();

            resolve("Scan complete");
        })
    }

}