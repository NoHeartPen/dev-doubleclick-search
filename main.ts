import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { scan_input_string } from 'nonjishokei';

let lastKeyupTime = 0;
let lastKeyWasDouble: boolean

export let indexDb: { [key: string]: string[] };
export let conjugateRuleDb: { [key: string]: string[] };
export let specialRuleDb: { [key: string]: string[] };


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
			// 如果未选中文本的话，自动向前查找
			const before_cursor_text = editor.getRange({ line: cursor.line, ch: 0 }, cursor);
			console.log(before_cursor_text)
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

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
	conjugateRuleDbFileName: string
	specialRuleDbFileName: string
	indexDbFileName: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	// 非辞書算法使用的数据文件
	indexDbFileName: '.obsidian/plugins/obsidian-sample-plugin/rules/index.json',
	conjugateRuleDbFileName: '.obsidian/plugins/obsidian-sample-plugin/rules/conjugate_rule.json',
	specialRuleDbFileName: '.obsidian/plugins/obsidian-sample-plugin/rules/special_rule.json',
	mySetting: 'default',
}

/**
 * 检查加载的JSON文件是否合法
 * @param db 
 * @returns 
 */
function validateDB(db: any): boolean {
	return typeof db === "object" && !Array.isArray(db);
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	indexDb: { [key: string]: string[] };
	conjugateRuleDb: { [key: string]: string[] };
	specialRuleDb: { [key: string]: string[] };

	/**
	 * 读取JSON文件
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

	/**
	 * 加载非辞書项目的数据文件
	 */
	private async loadNonJiShoKeiDB() {
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
	}


	async onload() {
		this.registerDomEvent(window, 'keyup', (event) => openSearchWhenDoubleClicked(event, this.app))
		this.registerDomEvent(window, 'keydown', (event) => clearTimerWhenControlled(event))
		await this.loadSettings();
		await this.loadNonJiShoKeiDB();
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
