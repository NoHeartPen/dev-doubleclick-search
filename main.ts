import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

let lastKeyupTime = 0;
let lastKeyWasDouble: boolean

let indexDb: { [key: string]: string[] };
let conjugateRuleDb: { [key: string]: string[] };
let specialRuleDb: { [key: string]: string[] };


function openSearchWhenDoubleClicked(event: KeyboardEvent, app: App) {
	const key = event.key
	// TODO 读取用户自定义的双击按键名
	if (key !== "Control") {
		lastKeyupTime = 0;
		return;
	}
	if (lastKeyWasDouble) {
		lastKeyWasDouble = false;

		return;
	}
	if (Date.now() - lastKeyupTime < 500) {
		lastKeyupTime = 0;
		getEditorCursor()
		return;
	}
	lastKeyupTime = Date.now();
}


/** 
 * 用户双击时自动
 */
function clearTimerWhenControlled(event: KeyboardEvent) {
	const key = event.key
	// TODO 注意下面的按键需要
	const userSetKey = event.ctrlKey;
	// TODO ""
	if (key !== "Control" && userSetKey === true) {
		lastKeyWasDouble = true
	}
}

function getEditorCursor() {
	const view = this.app.workspace.getActiveViewOfType(MarkdownView);

	// Make sure the user is editing a Markdown file.
	if (view) {
		const editor = view.editor;
		const selection = editor.getSelection();
		let searchText = "";
		if (selection === "") {
			// 如果未选中文本，那么自动向后查找
			const cursor = editor.getCursor();
			const after_cursor_text = editor.getRange(cursor, { line: cursor.line, ch: editor.getLine(cursor.line).length });
			searchText = after_cursor_text;
		} else {
			searchText = selection;
		}

		console.debug(`all result: ${scan_input_string(searchText)}`)
		const jishokei_list: string[] = scan_input_string(searchText)
		doSearch(jishokei_list);
	}

}

/**
 * 执行搜索动作
 * @param jishokei_list 推导的辞书形
 */
function doSearch(jishokei_list: string[]) {
	window.location.href = `mkdictionaries:///?text=${jishokei_list[0]}`;
	// GoldenDict，仅在 Window 和 Linux 上有效
	//window.location.href = `goldendict:///${jishokei_list[0]}`
	window.location.href = `eudic://dict//${jishokei_list[0]}`;
	// macOS系统辞典程序
	window.location.href = `dict://${jishokei_list[0]}`;
}

/**
 * 
 * @param input_text 
 * @returns 
 */
export function convert_conjugate(input_text: string): string[] {
	const input_stem: string = input_text.slice(0, -1);
	const input_last_letter: string = input_text.slice(-1);
	const process_output_list: string[] = [];
	// TODO 一段动词的词干必定是え段假名，对于見る这样汉字就是词干的动词特殊
	// 本程序的 input_stem 概念对应的不是一段动词语法意义上的词干
	// 今日は、寿司を**食べ**に銀座に行いきます。
	const process_text: string = input_text + "る";
	process_output_list.push(process_text);
	console.debug(`add ${process_text} to ${process_output_list}: for v1`);

	const jishokei_last_letter_list: string[] | undefined = conjugateRuleDb[input_last_letter];
	if (jishokei_last_letter_list !== undefined) {
		for (const jishokei_last_letter of jishokei_last_letter_list) {
			process_output_list.push(input_stem + jishokei_last_letter);
			console.debug(
				`add ${input_stem + jishokei_last_letter} to ${process_output_list}: for conjugate rule`
			);
		}
	}

	// 将输入的字符串作为最后一个结果返回
	// 因为输入的字符串可能就是正确的辞書型
	if (!process_output_list.includes(input_text)) {
		process_output_list.push(input_text);
	}

	// 删除其中的重复值，只保留第一次的结果
	const output_list: string[] = [];
	for (const i of process_output_list) {
		if (!output_list.includes(i)) {
			output_list.push(i);
		}
	}

	return output_list;
}


function convert_nonjishokei(input_text: string): string[] {
	// 还原动词的活用变形
	const converted_conjugate_list: string[] = convert_conjugate(input_text);
	// 检查还原结果
	const orthography_list: string[] = [];
	console.debug(`all converted conjugate list: ${converted_conjugate_list}`);
	for (const i of converted_conjugate_list) {
		const orthography_text_list: string[] | null = convertOrthography(i);
		if (orthography_text_list !== null) {
			for (const orthography_text of orthography_text_list) {
				if (orthography_text != "") {
					if (!(orthography_text in orthography_list)) {
						orthography_list.push(orthography_text);
					}
				}
			}
		}
	}
	const output_list: string[] = [];
	for (const i of orthography_list) {
		output_list.push(i);
	}
	return output_list;
}


function convertOrthography(inputText: string): string[] | null {
	if (typeof indexDb[inputText] !== 'undefined') {
		const value = indexDb[inputText];
		return value;
	} else {
		return null;
	}
}

function scan_input_string(input_text: string): string[] {
	if (input_text === "") {
		return [];
	}

	// TODO 预处理
	//input_text = preprocess(input_text);

	// 记录扫描的临时字符串
	const scanned_input_list: string[] = [];
	// 记录扫描过程中的推导结果
	const scan_process_list: string[] = [];
	for (let input_index = 0; input_index < input_text.length + 1; input_index++) {
		const scanned_input_text: string = input_text.slice(0, input_index + 1);
		console.debug(`scanned_input_text: ${scanned_input_text}`);
		scanned_input_list.push(scanned_input_text);

		// 特殊规则
		const special_output_text: string[] | undefined = specialRuleDb[scanned_input_text];
		if (special_output_text !== undefined) {
			for (const i of special_output_text) {
				scan_process_list.push(i);
			}
		}

		// TODO 用户自定义的转换规则

		const scan_output_text: string[] = convert_nonjishokei(scanned_input_text);
		for (const i of scan_output_text) {
			console.debug(`add ${i} to scan_process_list`);
			scan_process_list.push(i);
		}
	}

	// 返回给用户的扫描结果
	const scan_output_list: string[] = [];
	// 优先展示更长字符串的扫描结果，提高复合动词的使用体验
	for (const i of [...scan_process_list].reverse()) {
		// 只添加第一次的推导结果
		if (!scan_output_list.includes(i)) {
			// 不添加扫描过程中的临时字符串
			// if (!scanned_input_list.includes(i)) {
			scan_output_list.push(i);
			// }
		}
	}

	// 将输入的字符串作为最后一个结果返回
	// 方便用户在程序无法推导出正确结果时快速编辑
	if (!scan_output_list.includes(input_text)) {
		console.debug(`add input_text ${input_text} to scan_process_list`);
		scan_output_list.push(input_text);
	}

	return scan_output_list;
}



// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
	conjugateRuleDbFileName: string
	specialRuleDbFileName: string
	indexDbFileName: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	indexDbFileName: '.obsidian/plugins/obsidian-sample-plugin/rules/index.json',
	conjugateRuleDbFileName: '.obsidian/plugins/obsidian-sample-plugin/rules/conjugate_rule.json',
	specialRuleDbFileName: '.obsidian/plugins/obsidian-sample-plugin/rules/special_rule.json',
	mySetting: 'default',
}

function validateDB(db: any): boolean {
	return typeof db === "object" && !Array.isArray(db);
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	indexDb: { [key: string]: string[] };
	conjugateRuleDb: { [key: string]: string[] };
	specialRuleDb: { [key: string]: string[] };

	/**
	 * 加载数据库
	 * @param dbFileName 
	 * @returns 
	 */
	async loadDB(dbFileName: string): Promise<{ [key: string]: string[] }> {
		try {
			if (await this.app.vault.adapter.exists(dbFileName)) {
				const data = await this.app.vault.adapter.read(dbFileName);
				const db = JSON.parse(data);

				// 数据结构验证
				if (validateDB(db)) {
					console.log("Database loaded successfully:", db);
					return db;
				} else {
					console.error("Invalid database structure detected.");
					// 返回默认值或者抛出错误，根据你的需求来决定
					return {};
				}
			} else {
				console.warn("Database file not found. Creating a new one.");
				return {}; // 返回空对象作为默认值
			}
		} catch (error) {
			console.error("Error loading database:", error);
			throw error; // 抛出错误，以便上层代码处理
		}
	}

	async onload() {
		this.registerDomEvent(window, 'keyup', (event) => openSearchWhenDoubleClicked(event, this.app))
		this.registerDomEvent(window, 'keydown', (event) => clearTimerWhenControlled(event))
		await this.loadSettings();
		try {
			indexDb = await this.loadDB(this.settings.indexDbFileName);
		} catch (e) {
			console.error(
				"Remember Cursor Position plugin can't read database: " + e
			);
			indexDb = {};
		}

		try {
			conjugateRuleDb = await this.loadDB(this.settings.conjugateRuleDbFileName);

		} catch (e) {
			console.error(
				"Remember Cursor Position plugin can't read database: " + e
			);
			conjugateRuleDb = {};
		}

		try {
			specialRuleDb = await this.loadDB(this.settings.specialRuleDbFileName);
		} catch (e) {
			console.error(
				"Remember Cursor Position plugin can't read database: " + e
			);
			specialRuleDb = {};
		}
		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('This is a notice!');
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
