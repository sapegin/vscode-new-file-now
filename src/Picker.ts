import {
  window,
  type QuickPickItem,
  type QuickPick,
  Uri,
  ThemeIcon,
} from 'vscode';
import { mkdirp } from 'mkdirp';
import escapeRegExp from 'lodash/escapeRegExp';
import { dirname, join, sep } from 'path';
import { existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import { logMessage } from './debug';

// Octicons icons: https://code.visualstudio.com/api/references/icons-in-labels
const ICON_NONE = new ThemeIcon('squirrel');
const ICON_FILE = ThemeIcon.File;
const ICON_DIRECTORY = ThemeIcon.Folder;

export default class Picker {
  /** Root directory of the workspace */
  private workspaceRoot: string;
  /** Directory of the currently open file, relative to the workspace root */
  private relativeBase: string;
  /** Value typed in the quick pick input */
  private value = '';
  private quickPick: QuickPick<QuickPickItem>;

  public constructor(workspaceRoot: string, relativeBase = '') {
    this.workspaceRoot = workspaceRoot;
    this.relativeBase = relativeBase;

    this.quickPick = window.createQuickPick<QuickPickItem>();
    this.quickPick.onDidHide(() => this.quickPick.dispose());
    this.quickPick.onDidAccept(() => this.createNew());
    this.quickPick.onDidChangeValue(this.handleInputValueChange, this);
  }

  public show() {
    this.updateSuggestion();
    this.quickPick.show();
  }

  private handleInputValueChange(input: string) {
    this.value = input.trim();
    this.updateSuggestion();
  }

  private async createNew() {
    const relativePath = this.getRelativePath();
    const fullPath = this.getAbsolutePath();

    if (this.isDirectory()) {
      // User types a folder name: foo/bar/
      logMessage('Creating a folder:', fullPath);

      // Create a folder with all subfolders
      const created = await this.ensureFolder(fullPath);
      if (created === false) {
        return;
      }

      // There seem to be no API to reveal a folder in Explorer,
      // so show a notification instead
      window.showInformationMessage(`Folder created: ${relativePath}`);
    } else {
      // User types a file name: foo/bar.ext

      // Check if file already exists
      if (existsSync(fullPath)) {
        // Open the file and show an info message
        await window.showTextDocument(Uri.file(fullPath));
        window.showInformationMessage(`File already exists: ${relativePath}`);
        return;
      }

      logMessage('Creating a file:', fullPath);

      // Create an empty file
      const created = await this.ensureFile(fullPath);
      if (created === false) {
        return;
      }

      // Open the new file
      await window.showTextDocument(Uri.file(fullPath));
    }

    this.quickPick.hide();
  }

  private async ensureFile(fullPath: string) {
    try {
      // Create a folder if needed
      await mkdirp(dirname(fullPath));

      // Create an empty file
      await writeFile(fullPath, '');

      return true;
    } catch (err) {
      if (err instanceof Error) {
        logMessage('Can’t create a file:', err.message);
        window.showErrorMessage('Can’t create a file');
      }
    }
    return false;
  }

  private async ensureFolder(directory: string) {
    try {
      await mkdirp(directory);
      return true;
    } catch (err) {
      if (err instanceof Error) {
        logMessage('Can’t create a folder:', err.message);
        window.showErrorMessage('Can’t create a folder');
      }
    }
    return false;
  }

  private updateSuggestion() {
    if (this.value === '') {
      // User hasn't entered anything yet
      this.quickPick.items = [
        {
          alwaysShow: true,
          iconPath: ICON_NONE,
          label: join(this.relativeBase, '…'),
          detail: `Type a path to a file or a folder (append \`${sep}\` to create a folder)`,
        },
      ];
      return;
    }

    this.quickPick.items = [
      {
        alwaysShow: true,
        iconPath: this.isDirectory() ? ICON_DIRECTORY : ICON_FILE,
        label: this.getRelativePath(),
        detail: this.getDetailText(),
      },
    ];
  }

  private getDetailText() {
    const isDirectory = this.isDirectory();

    if (existsSync(this.getAbsolutePath())) {
      return isDirectory
        ? 'Folder already exists'
        : 'File already exists, press Enter to open';
    }

    return isDirectory
      ? 'Press Enter to create a new folder'
      : 'Press Enter to create a new file';
  }

  /** Entered path is a directory? */
  private isDirectory() {
    return this.value.endsWith(sep);
  }

  /** Entered path is an absolute path (meaning it starts with workspace root)? */
  private isRoot() {
    return this.value.startsWith(sep);
  }

  /** Base base that takes into account whether entered path is absolute or not */
  private getRelativeBase() {
    return this.isRoot() ? '' : this.relativeBase;
  }

  /** Absolute path of the selected file */
  private getAbsolutePath() {
    return join(this.workspaceRoot, this.getRelativeBase(), this.value);
  }

  /** Path of the entered file relative to the workspace root */
  private getRelativePath() {
    return join(this.getRelativeBase(), this.value).replace(
      new RegExp(`^${escapeRegExp(sep)}`),
      '',
    );
  }
}
