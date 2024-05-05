import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

let lastKeyupTime = 0;
let lastKeyWasShifted: boolean

function openSearchWhenDoubleShift(event: KeyboardEvent, app: App) {
	const key = event.key
	if (key !== "Control") {
		lastKeyupTime = 0;
		return;
	}
	if (lastKeyWasShifted) {
		lastKeyWasShifted = false;

		return;
	}
	if (Date.now() - lastKeyupTime < 500) {
		lastKeyupTime = 0;
		getEditorCursor()
		return;
	}
	lastKeyupTime = Date.now();
}

function getEditorCursor() {
	const view = this.app.workspace.getActiveViewOfType(MarkdownView);

	// Make sure the user is editing a Markdown file.
	if (view) {
		const cursor = view.editor.getCursor();
		console.log(cursor)
		const selection = view.editor.getSelection();
		console.log(selection)

		window.location.href = `mkdictionaries:///?text=${selection}`

	}

}

function clearTimerWhenControlled(event: KeyboardEvent) {
	const key = event.key
	const ctrlKey = event.ctrlKey;
	if (key !== "Control" && ctrlKey === true) {
		lastKeyWasShifted = true
	}
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
		this.registerDomEvent(window, 'keyup', (event) => openSearchWhenDoubleShift(event, this.app))
		this.registerDomEvent(window, 'keydown', (event) => clearTimerWhenControlled(event))
		await this.loadSettings();
		try {
			this.indexDb = await this.loadDB(this.settings.indexDbFileName);
		} catch (e) {
			console.error(
				"Remember Cursor Position plugin can\'t read database: " + e
			);
			this.indexDb = {};
		}

		try {
			this.conjugateRuleDb = await this.loadDB(this.settings.conjugateRuleDbFileName);

		} catch (e) {
			console.error(
				"Remember Cursor Position plugin can\'t read database: " + e
			);
			this.conjugateRuleDb = {};
		}

		try {
			this.specialRuleDb = await this.loadDB(this.settings.specialRuleDbFileName);
		} catch (e) {
			console.error(
				"Remember Cursor Position plugin can\'t read database: " + e
			);
			this.conjugateRuleDb = {};
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
