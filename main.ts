import { App, Editor, MarkdownView, Platform, Notice, Plugin, PluginSettingTab, Setting, TFile, normalizePath } from 'obsidian';


/**
 * 调试模式开关
 */
const isDebug = false;

/**
 * 调试日志
 */
function debugLog(...args: string[]) {
	if (isDebug) {
		console.log(...args);
	}
}


/**
 * 获取光标所在行的上下文和索引，如果当前无有效 Markdown 编辑器视图，则返回 null。
 * @returns {object|null} 返回一个对象，包含以下属性：
 *  - context {string} 当前光标所在行的文本内容
 *  - cursorIndex {number} 当前光标在该行内的字符索引（从0开始）
 */
function getCursorContextAndIndex(): { context: string, cursorIndex: number } | null {
	const view = this.app.workspace.getActiveViewOfType(MarkdownView);
	if (!view) {
		console.error('No active MarkdownView found.');
		return null;
	}
	const editor = view.editor;
	/**
	 * 用户想查单词所在的上下文，用于形态素分析
	 */
	let context = "";
	/**
	 * 光标在上下文中的位置，用于计算形态素分析结果中最靠近光标的结果
	 */
	let cursorIndex = 0;
	const selection = editor.getSelection();
	if (selection === "") {
		// 如果用户没有选中文字，那么获取光标所在行的所有文本作为上下文
		const cursor = editor.getCursor();
		context = editor.getLine(cursor.line);
		cursorIndex = cursor.ch;
	} else {
		context = selection;
		cursorIndex = 0;
	}
	return { context, cursorIndex };
}

/**
 * 移除字符串中的常见 Markdown 语法和 Obsidian 高亮标记，
 * 返回去除格式后的纯文本内容。
 * @param text 输入的可能包含 Markdown 格式的文本
 * @returns 去除 Markdown 格式后的纯文本
 */
function removeMarkdownSyntax(text: string): string {
	return text
		// 移除加粗 **text**
		.replace(/\*\*(.*?)\*\*/g, '$1')
		// 移除斜体 *text* or _text_
		.replace(/(\*|_)(.*?)\1/g, '$2')
		// 移除行内 `code`
		.replace(/`([^`]+)`/g, '$1')
		// Obsidian 专用高亮语法 ==text==
		.replace(/==(.+?)==/g, '$1')
		// 块引用 > blockquote
		.replace(/^>\s?/gm, '')
		// 标题 # Headings、 列表 -, +, *
		.replace(/^[#*-]\s?/gm, '')
		.trim();
}

/**
 * 获取光标附近的单词，并将上下文和单词保存到历史记录
 */
async function getCursorWord(): Promise<string | undefined> {
	let context = getCursorContextAndIndex()?.context ?? "";
	const cursorIndex = getCursorContextAndIndex()?.cursorIndex ?? 0;
	debugLog(`context: ${context}, cursorIndex: ${cursorIndex}`);
	const word = await analyzeCursorWord(context, cursorIndex)
	debugLog(`cursorWord: ${word}`);
	if (word !== undefined) {
		context = removeMarkdownSyntax(context);
		writeToHistory(PLUGIN_SETTINGS.historyFilePath, context, word);
	}
	return word;
}


/**
 * 将查词历史记录写入到指定的文件中
 * @param filePath 保存查词历史的文件路径
 * @param context 查词时的上下文
 * @param word 查询的单词
 */
async function writeToHistory(filePath: string, context: string, word: string): Promise<void> {
	const normalizedFilePath = normalizePath(filePath);

	const activeFile = this.app.workspace.getActiveFile();

	if (!activeFile) {
		throw new Error('No active file found. Cannot create back link.');
	}
	/**
	 * 添加所查单词的文件作为反向链接
	 */
	const backLink = `[[${activeFile.basename}]]`;

	const vault = this.app.vault;
	const file = vault.getAbstractFileByPath(normalizedFilePath);
	const noteContent = `\n> ${context} ${backLink}\n> ${word}\n> メモ：\n`;

	if (file instanceof TFile) {
		await vault.append(file, noteContent);
	} else {
		await vault.create(filePath, noteContent);
	}
	debugLog(`Content written to file: ${filePath}`);
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
	debugLog(data);
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

	private lastKeyupTime = 0;
	private lastKeyWasDouble: boolean

	/**
	 * 双击监听指定按键时触发搜索
	 * @param event 
	 * @param app 
	 */
	private searchOnDoublePress(event: KeyboardEvent, app: App) {
		const key = event.key;
		if (key !== PLUGIN_SETTINGS.doubleClickedKey) {
			this.lastKeyupTime = 0;
			return;
		}

		if (this.lastKeyWasDouble) {
			this.lastKeyWasDouble = false;
			return;
		}

		if (Date.now() - this.lastKeyupTime < 500) {
			this.lastKeyupTime = 0;
			searchWordAtCursor();
		}
		this.lastKeyupTime = Date.now();
	}

	/** 
	 * 双击指定按键后清空计时器
	 */
	private clearTimerOnDoublePress(event: KeyboardEvent) {
		if (event.key !== PLUGIN_SETTINGS.doubleClickedKey) {
			this.lastKeyWasDouble = true;
		}
	}

	async onload() {
		await this.loadSettings();
		this.registerDomEvent(window, 'keyup', (event) => this.searchOnDoublePress(event, this.app));
		this.registerDomEvent(window, 'keydown', (event) => this.clearTimerOnDoublePress(event));

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
			// FIXME 封装，因为有可能在写入笔记时文件又被删除了
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
		debugLog(`write 「${word}」 to clipboard successfully`);
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
	debugLog(`openDictUrl: ${PLUGIN_SETTINGS.dictURL}`);
	if (PLUGIN_SETTINGS.dictURL.includes("<text_to_search>")) {
		// Monokakido URL Scheme is end with "<text_to_search>".
		debugLog(`defaultDictURL is ${PLUGIN_SETTINGS.dictURL}, includes <text_to_search>`);
		dictUrl = PLUGIN_SETTINGS.dictURL.replace("<text_to_search>", word);
	} else if (PLUGIN_SETTINGS.dictURL.includes("<文字列>")) {
		debugLog(`defaultDictURL is ${PLUGIN_SETTINGS.dictURL}, includes <文字列>`);
		dictUrl = PLUGIN_SETTINGS.dictURL.replace("<文字列>", word);
	} else if (PLUGIN_SETTINGS.dictURL.includes("{w}")) {
		// 通用的网址链接{w}
		debugLog(`defaultDictURL is ${PLUGIN_SETTINGS.dictURL}, includes {w}`);
		dictUrl = PLUGIN_SETTINGS.dictURL.replace("{w}", word);
	}
	else {
		// 直接在 URL Scheme 末尾拼接上单词
		debugLog(`defaultDictURL is ${PLUGIN_SETTINGS.dictURL}`);
		dictUrl = PLUGIN_SETTINGS.dictURL + word;
	}
	window.open(dictUrl, '_blank');
}

