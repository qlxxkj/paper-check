/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/main/preload.ts"
/*!*****************************!*\
  !*** ./src/main/preload.ts ***!
  \*****************************/
(__unused_webpack_module, exports, __webpack_require__) {

eval("{\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nconst electron_1 = __webpack_require__(/*! electron */ \"electron\");\nelectron_1.contextBridge.exposeInMainWorld('electronAPI', {\n    importFiles: (filePaths) => electron_1.ipcRenderer.invoke('import-files', filePaths),\n    importFolder: (folderPath) => electron_1.ipcRenderer.invoke('import-folder', folderPath),\n    importMixed: (paths) => electron_1.ipcRenderer.invoke('import-mixed', paths),\n    onImportProgress: (callback) => {\n        electron_1.ipcRenderer.on('import-progress', (_, data) => callback(data));\n    },\n    getAllDocs: () => electron_1.ipcRenderer.invoke('get-all-docs'),\n    backupDB: () => electron_1.ipcRenderer.invoke('backup-db'),\n    restoreDB: (path) => electron_1.ipcRenderer.invoke('restore-db', path),\n    clearAll: () => electron_1.ipcRenderer.invoke('clear-all'),\n    openFileDialog: (options) => electron_1.ipcRenderer.invoke('open-file-dialog', options),\n    getDocParagraphs: (docId) => electron_1.ipcRenderer.invoke('get-doc-paragraphs', docId),\n    getRepeatRelations: (docId) => electron_1.ipcRenderer.invoke('get-repeat-relations', docId),\n    getDuplicateParagraphs: (docId1, docId2) => electron_1.ipcRenderer.invoke('get-duplicate-paragraphs', docId1, docId2),\n    exportDocsZip: (docIds) => electron_1.ipcRenderer.invoke('export-docs-zip', docIds),\n    openDoc: (filePath) => electron_1.ipcRenderer.invoke('open-doc', filePath),\n    deleteDoc: (docId) => electron_1.ipcRenderer.invoke('delete-doc', docId),\n    batchDelete: (docIds) => electron_1.ipcRenderer.invoke('batch-delete', docIds),\n    batchMarkSource: (docIds) => electron_1.ipcRenderer.invoke('batch-mark-source', docIds),\n    exportDataZip: (docIds) => electron_1.ipcRenderer.invoke('export-data-zip', docIds),\n});\n\n\n//# sourceURL=webpack://paper-check/./src/main/preload.ts?\n}");

/***/ },

/***/ "electron"
/*!***************************!*\
  !*** external "electron" ***!
  \***************************/
(module) {

module.exports = require("electron");

/***/ }

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	const __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		const cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		const module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		if (!(moduleId in __webpack_modules__)) {
/******/ 			delete __webpack_module_cache__[moduleId];
/******/ 			const e = new Error("Cannot find module '" + moduleId + "'");
/******/ 			e.code = 'MODULE_NOT_FOUND';
/******/ 			throw e;
/******/ 		}
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module can't be inlined because the eval devtool is used.
/******/ 	let __webpack_exports__ = __webpack_require__("./src/main/preload.ts");
/******/ 	
/******/ })()
;