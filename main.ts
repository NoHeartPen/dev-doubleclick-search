import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { TFile } from 'obsidian';

let lastKeyupTime = 0;
let lastKeyWasDouble: boolean

/**
 * 允许用户自定义按键
 * @param key 触发分析的按键
 */
function setUserDefinedKey(key: string) {
	// TODO 检查用户的自定义按键是否合法
	PLUGIN_SETTINGS.doubleClickedKey = key;
	console.log(`User custume double clicked key is: ${PLUGIN_SETTINGS.doubleClickedKey}`);
}

/**
 * 注册双击监听事件
 * @param event 
 * @param app 
 */
function openSearchWhenDoubleClicked(event: KeyboardEvent, app: App) {
	const key = event.key;
	if (key !== PLUGIN_SETTINGS.doubleClickedKey) {
		lastKeyupTime = 0;
		return;
	}

	if (lastKeyWasDouble) {
		lastKeyWasDouble = false;
		return;
	}

	if (Date.now() - lastKeyupTime < 500) {
		new Notice(`分析中...`);
		lastKeyupTime = 0;
		getCursorWord().then((cursorWord) => {
			if (cursorWord === undefined) {
				console.log("cursor word is undefined");
				return;
			}
			console.log("cursor word is: ", cursorWord);
			doSearch(cursorWord);
		}).catch((error) => {
			console.error("get cursor word with error:", error);
		});
		return;
	}
	lastKeyupTime = Date.now();
}

/** 
 * 用户双击时自动处理逻辑
 */
function clearTimerWhenDoubleClicked(event: KeyboardEvent) {
	if (event.key !== PLUGIN_SETTINGS.doubleClickedKey) {
		lastKeyWasDouble = true;
	}
}

function getCursorContextAndIndex(): { context: string, cursorIndex: number } | undefined {
	const view = this.app.workspace.getActiveViewOfType(MarkdownView);
	if (view) {
		const editor = view.editor;
		const selection = editor.getSelection();
		/**
		 * 光标所在行的所有文本，用于分析光标附近文本对应的辞书形
		 */
		let context = "";
		/**
		 * 光标所在的位置，用于计算形态素分析结果
		 */
		let cursorIndex = 0;
		if (selection === "") {
			const cursor = editor.getCursor();
			// 获取光标所在行的所有文本
			const cursorLineText = editor.getRange({ line: cursor.line, ch: 0 }, { line: cursor.line, ch: editor.getLine(cursor.line).length });
			context = cursorLineText
			cursorIndex = cursor.ch;
		} else {
			// 如果用户有选中文本，那么直接提交选中的文本
			// TODO 笑了这种情况下 cursorIndex 直接使用 0 就行了么
			context = selection;
			cursorIndex = 0;
		}
		// TODO 删除文本中的 markdown 语法，比如 **bold**，*italic*，`code`,>,
		return { context, cursorIndex };
	} else {
		console.error("No active MarkdownView found.");
		return;
	}
}

/**
 * 获取光标附近的单词
 */
async function getCursorWord(): Promise<string | undefined> {
	const context = getCursorContextAndIndex()?.context ?? "";
	const cursorIndex = getCursorContextAndIndex()?.cursorIndex ?? 0;
	console.log(`context: ${context}, cursorIndex: ${cursorIndex}`);
	const cursorWord = await analyzeCursorWord(context, cursorIndex)
	console.log(`cursorWord: ${cursorWord}`);
	// 
	if (cursorWord !== undefined) {
		// TODO use setting path
		writeToFile('MonoKakido History.md', context, cursorWord);
	}
	return cursorWord;
}

/**
 * TODO
 */
async function writeToFile(fileName: string, context: string, cursorWord: string): Promise<void> {
	const activeFile = this.app.workspace.getActiveFile();
	const vault = this.app.vault;
	const file = vault.getAbstractFileByPath(fileName);
	const backLink = `[[${activeFile.basename}]]`;
	// TODO 允许用户通过设置自定义
	const noteContent = `> ${context} ${backLink} \n> ${cursorWord} \n> メモ：\n\n`;
	if (activeFile) {
		if (file instanceof TFile) {
			await vault.append(file, noteContent);
		} else {
			await vault.create(fileName, noteContent);
		}
		console.log(`Content written to file: ${fileName}`);
	} else {
		console.log("No active file found. Cannot create back link.");
	}
}

/**
 * 获取光标处附近的英文单词
 * @param context 文本域的内容
 * @returns 光标附近的英文单词，如果没有则返回空字符串
 */
export function getCursorEnglishWord(context: string, cursorIndex: number): string {
	let start: number = cursorIndex;
	let end: number = cursorIndex;

	// 向前扫描，找到单词起点
	while (start > 0 && /\S/.test(context[start - 1])) {
		start--;
	}
	// 向后扫描，找到单词终点
	while (end < context.length && /\S/.test(context[end])) {
		end++;
	}

	// 提取并返回光标附近的单词
	return context.substring(start, end).trim();
}


/**
 * 形态素分析
 * @param context 
 * @param cursorIndex 
 * @returns 
 */
async function analyzeCursorWord(context: string, cursorIndex: number): Promise<string | undefined> {
	// 如果不包含任何假名，那么直接通过空格推导
	if (!context.match(/[\u3040-\u309F\u30A0-\u30FF]/)) {
		return getCursorEnglishWord(context, cursorIndex);
	}
	const response = await fetch(PLUGIN_SETTINGS.morphemeAnalysisAPI, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			sentence: context,
			cursor_index: cursorIndex
		})
	});

	if (!response.ok) {
		console.error('HTTP error:', response.status);
		return;
	}

	const data = await response.json();
	// 返回的数据格式： {jishokei: 'かける'}
	console.log(data);
	const cursorWords = data.jishokei;
	return cursorWords;
}


/**
 * 执行搜索动作
 * @param word 推导的辞书形
 */
async function doSearch(word: string) {
	// 
	new Notice(`物書堂で「${word}」を引きました`);
	if (PLUGIN_SETTINGS.searchByOpenUrl === true) {
		openDictUrl(word)
	} else {
		await write2ClipBoard(word);
	}
}


interface PluginSettingsInterface {
	/**
	 * 调用辞書的 URL
	 */
	dictURL: string;
	/**
	 * 是否调用 URL Scheme 查询
	 */
	searchByOpenUrl: boolean;
	/**
	 * 形态素分析 API
	 */
	morphemeAnalysisAPI: string;
	/**
	 * 双击指定的按键触发搜索
	 */
	doubleClickedKey: string;
}

const PLUGIN_SETTINGS: PluginSettingsInterface = {
	// 默认使用 物書堂
	dictURL: 'mkdictionaries:///?text=<text_to_search>',
	// 默认不使用剪贴板查询模式
	searchByOpenUrl: false,
	// 如果你使用
	// http://127.0.0.1:8000/
	morphemeAnalysisAPI: 'https://fast-mikann-api.vercel.app/',
	// 默认按键为 Option 键（在 Windows 上是 Alt 键）
	doubleClickedKey: 'Alt'
}

export default class MonokakidoCopilotPlugin extends Plugin {
	settings: PluginSettingsInterface;


	async onload() {
		this.registerDomEvent(window, 'keyup', (event) => openSearchWhenDoubleClicked(event, this.app))
		this.registerDomEvent(window, 'keydown', (event) => clearTimerWhenDoubleClicked(event))

		// Open Monokakido History
		this.addRibbonIcon('file-clock', 'Monokakido Copilot History', (evt: MouseEvent) => {
			this.openHistoryFile();
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	private openHistoryFile() {
		const vault = this.app.vault;

		// TODO 只支持指定文件 MonoKakido Copilot History.md
		const filePath = 'MonoKakido Copilot History.md';

		// 查找并打开文件
		const file = vault.getAbstractFileByPath(filePath);
		if (file && file instanceof TFile) {
			this.app.workspace.openLinkText(filePath, '', true);
		} else {
			// TODO This document is used to history.-> {INIT}
			vault.create(filePath, '# MonoKakido Copilot History\n\nThis document is used to history.');
			// 
			new Notice('File created: ' + filePath);
			this.app.workspace.openLinkText(filePath, '', true);
		}
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, PLUGIN_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SettingTab extends PluginSettingTab {
	plugin: MonokakidoCopilotPlugin;

	constructor(app: App, plugin: MonokakidoCopilotPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Dict URL Scheme')
			.setDesc('')
			.addText(text => text
				.setPlaceholder(PLUGIN_SETTINGS.dictURL)
				.setValue(this.plugin.settings.dictURL)
				.onChange(async (value) => {
					this.plugin.settings.dictURL = value;
					await this.plugin.saveSettings();
				}));
		// TODO
		new Setting(containerEl)
			.setName('morphemeAnalysisAPI')
			.setDesc("if you not know this, please don't change it")
			.addText(text => text
				.setPlaceholder(PLUGIN_SETTINGS.morphemeAnalysisAPI)
				.setValue(this.plugin.settings.morphemeAnalysisAPI)
				.onChange(async (value) => {
					this.plugin.settings.morphemeAnalysisAPI = value;
					await this.plugin.saveSettings();
				}));
	}
}

/**
 * 写入剪贴板
 * @param word 
 */
async function write2ClipBoard(word: string) {
	try {
		await navigator.clipboard.writeText(word);
		console.log(`write 「${word}」 to clipboard successfully`);
	} catch (err) {
		console.error('can not write to clipboard :', err);
	}
}

/**
 * 通过调用 URL Scheme 打开辞书
 * @param word 
 */
function openDictUrl(word: string) {
	let dictUrl = "";
	if (PLUGIN_SETTINGS.dictURL.includes("<text_to_search>")) {
		// Monokakido URL Scheme is end with "<text_to_search>".
		console.log(`defaultDictURL is ${PLUGIN_SETTINGS.dictURL}, includes <text_to_search>`);
		dictUrl = PLUGIN_SETTINGS.dictURL.replace("<text_to_search>", word);
	} else if (PLUGIN_SETTINGS.dictURL.includes("{w}")) {
		// 通用的网址链接{w}
		console.log(`defaultDictURL is ${PLUGIN_SETTINGS.dictURL}, includes {w}`);
		dictUrl = PLUGIN_SETTINGS.dictURL.replace("{w}", word);
	}
	else {
		// 直接在 URL Scheme 末尾拼接上单词
		console.log(`defaultDictURL is ${PLUGIN_SETTINGS.dictURL}`);
		dictUrl = PLUGIN_SETTINGS.dictURL + word;
	}
	window.location.href = dictUrl;
}

