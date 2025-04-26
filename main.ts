import { App, Editor, MarkdownView, Platform, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';

let lastKeyupTime = 0;
let lastKeyWasDouble: boolean


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
		lastKeyupTime = 0;
		searchWordAtCursor();
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
	const word = await analyzeCursorWord(context, cursorIndex)
	console.log(`cursorWord: ${word}`);
	if (word !== undefined) {
		writeToHistory(PLUGIN_SETTINGS.historyFilePath, context, word);
	}
	return word;
}


/**
 * 将查词历史记录写入到指定的文件中
 * @param fileName 查词历史文件名
 * @param context 查词时的语境
 * @param word 所查单词
 */
async function writeToHistory(fileName: string, context: string, word: string): Promise<void> {
	const activeFile = this.app.workspace.getActiveFile();
	const vault = this.app.vault;
	const file = vault.getAbstractFileByPath(fileName);
	const backLink = `[[${activeFile.basename}]]`;
	// TODO 允许用户通过设置自定义
	const noteContent = `> ${context} ${backLink}\n> ${word}\n> メモ：\n\n`;
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
 * @param context 光标所在的上下文
 * @param cursorIndex 光标位置
 * @returns 光标附近的英文单词，如果没有则返回空字符串
 */
function getCursorEnglishWord(context: string, cursorIndex: number): string {
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
 * 分析光标附近的单词
 * @param context 光标所在的上下文
 * @param cursorIndex 光标的位置
 * @returns 如果含有假名那么调用 API 分析光标附近单词的辞书形，反之直接借助空格判断
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
	new Notice(`物書堂で「${word}」を引きました`);
	if (Platform.isMobileApp) {
		// 在移动设备上总是通过 URL 自动打开
		PLUGIN_SETTINGS.searchByOpenUrl = true;
	}

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
	/**
	 * 查词历史记录文件路径
	 */
	historyFilePath: string;
}

const PLUGIN_SETTINGS: PluginSettingsInterface = {
	// 默认使用 物書堂
	dictURL: 'mkdictionaries:///?text=<text_to_search>',
	// 默认不使用剪贴板查询模式
	searchByOpenUrl: false,
	// 如果你使用源码自己在本地部署请修改成 <http://127.0.0.1:8000/>
	// 形态素分析的源码 <https://github.com/NoHeartPen/fast-mikann-api>
	morphemeAnalysisAPI: 'https://www.nonjishokei.org/',
	// 默认按键为 Option 键（在 Windows 上是 Alt 键）
	doubleClickedKey: 'Alt',
	// 查词历史记录文件路径
	historyFilePath: 'MonoKakido Copilot History.md'
}

/**
 * 搜索光标附近的单词
 */
async function searchWordAtCursor() {
	new Notice('分析中、少々お待ちください。');
	try {
		const cursorWord = await getCursorWord();
		if (!cursorWord) {
			return;
		}
		doSearch(cursorWord);
	} catch (error) {
		console.error('Error getting cursor word:', error);
	}
}

export default class MonokakidoCopilotPlugin extends Plugin {
	settings: PluginSettingsInterface;

	async onload() {
		await this.loadSettings();
		this.registerDomEvent(window, 'keyup', (event) => openSearchWhenDoubleClicked(event, this.app));
		this.registerDomEvent(window, 'keydown', (event) => clearTimerWhenDoubleClicked(event));

		this.addRibbonIcon('file-clock', 'Monokakido Copilot history', () => {
			this.openHistoryFile();
		});

		this.registerCommands();

		this.addSettingTab(new SettingTab(this.app, this));
	}


	private registerCommands() {
		this.addCommand({
			id: 'open-monokakido-copilot-history',
			name: 'Open history',
			callback: () => {
				this.openHistoryFile();
			},
		});

		this.addCommand({
			id: 'search-monokakido-copilot',
			name: 'Search Cursor word',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				searchWordAtCursor();
			},
		});
	}

	private openHistoryFile() {
		const vault = this.app.vault;
		const filePath = PLUGIN_SETTINGS.historyFilePath;
		const file = vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			this.app.workspace.openLinkText(filePath, '', true);
		} else {
			vault.create(
				filePath,
				'# MonoKakido Copilot history\n\nThis document is used for history.'
			);
			new Notice(`単語メモ帳は: ${filePath}`);
			this.app.workspace.openLinkText(filePath, '', true);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, PLUGIN_SETTINGS, await this.loadData());
		PLUGIN_SETTINGS.dictURL = this.settings.dictURL;
	}

	async saveSettings() {
		await this.saveData(this.settings);
		PLUGIN_SETTINGS.dictURL = this.settings.dictURL;
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
					PLUGIN_SETTINGS.dictURL = value;
					await this.plugin.saveSettings();
				}));
	}
}

/**
 * 将要查的单词写入剪贴板
 * @param word 需要要写入剪贴板的单词
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
 * @param word 用于拼接 URL Scheme 的单词
 */
function openDictUrl(word: string) {
	let dictUrl = "";
	console.log(`openDictUrl: ${PLUGIN_SETTINGS.dictURL}`);
	if (PLUGIN_SETTINGS.dictURL.includes("<text_to_search>")) {
		// Monokakido URL Scheme is end with "<text_to_search>".
		console.log(`defaultDictURL is ${PLUGIN_SETTINGS.dictURL}, includes <text_to_search>`);
		dictUrl = PLUGIN_SETTINGS.dictURL.replace("<text_to_search>", word);
	} else if (PLUGIN_SETTINGS.dictURL.includes("<文字列>")) {
		console.log(`defaultDictURL is ${PLUGIN_SETTINGS.dictURL}, includes <文字列>`);
		dictUrl = PLUGIN_SETTINGS.dictURL.replace("<文字列>", word);
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
	window.open(dictUrl, '_blank');
}

