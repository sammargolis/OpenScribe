module.exports = [
"[externals]/fs [external] (fs, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("fs", () => require("fs"));

module.exports = mod;
}),
"[externals]/os [external] (os, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("os", () => require("os"));

module.exports = mod;
}),
"[project]/node_modules/.pnpm/@vercel+oidc@3.0.5/node_modules/@vercel/oidc/dist/token-io.js [app-rsc] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all)=>{
    for(var name in all)__defProp(target, name, {
        get: all[name],
        enumerable: true
    });
};
var __copyProps = (to, from, except, desc)=>{
    if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames(from))if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
            get: ()=>from[key],
            enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
    }
    return to;
};
var __toESM = (mod, isNodeMode, target)=>(target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(// If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
        value: mod,
        enumerable: true
    }) : target, mod));
var __toCommonJS = (mod)=>__copyProps(__defProp({}, "__esModule", {
        value: true
    }), mod);
var token_io_exports = {};
__export(token_io_exports, {
    findRootDir: ()=>findRootDir,
    getUserDataDir: ()=>getUserDataDir
});
module.exports = __toCommonJS(token_io_exports);
var import_path = __toESM(__turbopack_context__.r("[externals]/path [external] (path, cjs)"));
var import_fs = __toESM(__turbopack_context__.r("[externals]/fs [external] (fs, cjs)"));
var import_os = __toESM(__turbopack_context__.r("[externals]/os [external] (os, cjs)"));
var import_token_error = __turbopack_context__.r("[project]/node_modules/.pnpm/@vercel+oidc@3.0.5/node_modules/@vercel/oidc/dist/token-error.js [app-rsc] (ecmascript)");
function findRootDir() {
    try {
        let dir = process.cwd();
        while(dir !== import_path.default.dirname(dir)){
            const pkgPath = import_path.default.join(dir, ".vercel");
            if (import_fs.default.existsSync(pkgPath)) {
                return dir;
            }
            dir = import_path.default.dirname(dir);
        }
    } catch (e) {
        throw new import_token_error.VercelOidcTokenError("Token refresh only supported in node server environments");
    }
    throw new import_token_error.VercelOidcTokenError("Unable to find root directory");
}
function getUserDataDir() {
    if (process.env.XDG_DATA_HOME) {
        return process.env.XDG_DATA_HOME;
    }
    switch(import_os.default.platform()){
        case "darwin":
            return import_path.default.join(import_os.default.homedir(), "Library/Application Support");
        case "linux":
            return import_path.default.join(import_os.default.homedir(), ".local/share");
        case "win32":
            if (process.env.LOCALAPPDATA) {
                return process.env.LOCALAPPDATA;
            }
            return null;
        default:
            return null;
    }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
    findRootDir,
    getUserDataDir
});
}),
"[project]/node_modules/.pnpm/@vercel+oidc@3.0.5/node_modules/@vercel/oidc/dist/token-util.js [app-rsc] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all)=>{
    for(var name in all)__defProp(target, name, {
        get: all[name],
        enumerable: true
    });
};
var __copyProps = (to, from, except, desc)=>{
    if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames(from))if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
            get: ()=>from[key],
            enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
    }
    return to;
};
var __toESM = (mod, isNodeMode, target)=>(target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(// If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
        value: mod,
        enumerable: true
    }) : target, mod));
var __toCommonJS = (mod)=>__copyProps(__defProp({}, "__esModule", {
        value: true
    }), mod);
var token_util_exports = {};
__export(token_util_exports, {
    assertVercelOidcTokenResponse: ()=>assertVercelOidcTokenResponse,
    findProjectInfo: ()=>findProjectInfo,
    getTokenPayload: ()=>getTokenPayload,
    getVercelCliToken: ()=>getVercelCliToken,
    getVercelDataDir: ()=>getVercelDataDir,
    getVercelOidcToken: ()=>getVercelOidcToken,
    isExpired: ()=>isExpired,
    loadToken: ()=>loadToken,
    saveToken: ()=>saveToken
});
module.exports = __toCommonJS(token_util_exports);
var path = __toESM(__turbopack_context__.r("[externals]/path [external] (path, cjs)"));
var fs = __toESM(__turbopack_context__.r("[externals]/fs [external] (fs, cjs)"));
var import_token_error = __turbopack_context__.r("[project]/node_modules/.pnpm/@vercel+oidc@3.0.5/node_modules/@vercel/oidc/dist/token-error.js [app-rsc] (ecmascript)");
var import_token_io = __turbopack_context__.r("[project]/node_modules/.pnpm/@vercel+oidc@3.0.5/node_modules/@vercel/oidc/dist/token-io.js [app-rsc] (ecmascript)");
function getVercelDataDir() {
    const vercelFolder = "com.vercel.cli";
    const dataDir = (0, import_token_io.getUserDataDir)();
    if (!dataDir) {
        return null;
    }
    return path.join(dataDir, vercelFolder);
}
function getVercelCliToken() {
    const dataDir = getVercelDataDir();
    if (!dataDir) {
        return null;
    }
    const tokenPath = path.join(dataDir, "auth.json");
    if (!fs.existsSync(tokenPath)) {
        return null;
    }
    const token = fs.readFileSync(tokenPath, "utf8");
    if (!token) {
        return null;
    }
    return JSON.parse(token).token;
}
async function getVercelOidcToken(authToken, projectId, teamId) {
    try {
        const url = `https://api.vercel.com/v1/projects/${projectId}/token?source=vercel-oidc-refresh${teamId ? `&teamId=${teamId}` : ""}`;
        const res = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${authToken}`
            }
        });
        if (!res.ok) {
            throw new import_token_error.VercelOidcTokenError(`Failed to refresh OIDC token: ${res.statusText}`);
        }
        const tokenRes = await res.json();
        assertVercelOidcTokenResponse(tokenRes);
        return tokenRes;
    } catch (e) {
        throw new import_token_error.VercelOidcTokenError(`Failed to refresh OIDC token`, e);
    }
}
function assertVercelOidcTokenResponse(res) {
    if (!res || typeof res !== "object") {
        throw new TypeError("Expected an object");
    }
    if (!("token" in res) || typeof res.token !== "string") {
        throw new TypeError("Expected a string-valued token property");
    }
}
function findProjectInfo() {
    const dir = (0, import_token_io.findRootDir)();
    if (!dir) {
        throw new import_token_error.VercelOidcTokenError("Unable to find root directory");
    }
    try {
        const prjPath = path.join(dir, ".vercel", "project.json");
        if (!fs.existsSync(prjPath)) {
            throw new import_token_error.VercelOidcTokenError("project.json not found");
        }
        const prj = JSON.parse(fs.readFileSync(prjPath, "utf8"));
        if (typeof prj.projectId !== "string" && typeof prj.orgId !== "string") {
            throw new TypeError("Expected a string-valued projectId property");
        }
        return {
            projectId: prj.projectId,
            teamId: prj.orgId
        };
    } catch (e) {
        throw new import_token_error.VercelOidcTokenError(`Unable to find project ID`, e);
    }
}
function saveToken(token, projectId) {
    try {
        const dir = (0, import_token_io.getUserDataDir)();
        if (!dir) {
            throw new import_token_error.VercelOidcTokenError("Unable to find user data directory");
        }
        const tokenPath = path.join(dir, "com.vercel.token", `${projectId}.json`);
        const tokenJson = JSON.stringify(token);
        fs.mkdirSync(path.dirname(tokenPath), {
            mode: 504,
            recursive: true
        });
        fs.writeFileSync(tokenPath, tokenJson);
        fs.chmodSync(tokenPath, 432);
        return;
    } catch (e) {
        throw new import_token_error.VercelOidcTokenError(`Failed to save token`, e);
    }
}
function loadToken(projectId) {
    try {
        const dir = (0, import_token_io.getUserDataDir)();
        if (!dir) {
            return null;
        }
        const tokenPath = path.join(dir, "com.vercel.token", `${projectId}.json`);
        if (!fs.existsSync(tokenPath)) {
            return null;
        }
        const token = JSON.parse(fs.readFileSync(tokenPath, "utf8"));
        assertVercelOidcTokenResponse(token);
        return token;
    } catch (e) {
        throw new import_token_error.VercelOidcTokenError(`Failed to load token`, e);
    }
}
function getTokenPayload(token) {
    const tokenParts = token.split(".");
    if (tokenParts.length !== 3) {
        throw new import_token_error.VercelOidcTokenError("Invalid token");
    }
    const base64 = tokenParts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}
function isExpired(token) {
    return token.exp * 1e3 < Date.now();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
    assertVercelOidcTokenResponse,
    findProjectInfo,
    getTokenPayload,
    getVercelCliToken,
    getVercelDataDir,
    getVercelOidcToken,
    isExpired,
    loadToken,
    saveToken
});
}),
"[project]/node_modules/.pnpm/@vercel+oidc@3.0.5/node_modules/@vercel/oidc/dist/token.js [app-rsc] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all)=>{
    for(var name in all)__defProp(target, name, {
        get: all[name],
        enumerable: true
    });
};
var __copyProps = (to, from, except, desc)=>{
    if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames(from))if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
            get: ()=>from[key],
            enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
    }
    return to;
};
var __toCommonJS = (mod)=>__copyProps(__defProp({}, "__esModule", {
        value: true
    }), mod);
var token_exports = {};
__export(token_exports, {
    refreshToken: ()=>refreshToken
});
module.exports = __toCommonJS(token_exports);
var import_token_error = __turbopack_context__.r("[project]/node_modules/.pnpm/@vercel+oidc@3.0.5/node_modules/@vercel/oidc/dist/token-error.js [app-rsc] (ecmascript)");
var import_token_util = __turbopack_context__.r("[project]/node_modules/.pnpm/@vercel+oidc@3.0.5/node_modules/@vercel/oidc/dist/token-util.js [app-rsc] (ecmascript)");
async function refreshToken() {
    const { projectId, teamId } = (0, import_token_util.findProjectInfo)();
    let maybeToken = (0, import_token_util.loadToken)(projectId);
    if (!maybeToken || (0, import_token_util.isExpired)((0, import_token_util.getTokenPayload)(maybeToken.token))) {
        const authToken = (0, import_token_util.getVercelCliToken)();
        if (!authToken) {
            throw new import_token_error.VercelOidcTokenError("Failed to refresh OIDC token: login to vercel cli");
        }
        if (!projectId) {
            throw new import_token_error.VercelOidcTokenError("Failed to refresh OIDC token: project id not found");
        }
        maybeToken = await (0, import_token_util.getVercelOidcToken)(authToken, projectId, teamId);
        if (!maybeToken) {
            throw new import_token_error.VercelOidcTokenError("Failed to refresh OIDC token");
        }
        (0, import_token_util.saveToken)(maybeToken, projectId);
    }
    process.env.VERCEL_OIDC_TOKEN = maybeToken.token;
    return;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
    refreshToken
});
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__d6900b10._.js.map