/**
 * @packageDocumentation
 *
 * Plugin settings manager base class.
 */

import type { App } from 'obsidian';
import type {
  Promisable,
  ReadonlyDeep
} from 'type-fest';

import type { GenericObject } from '../../Object.ts';
import type { Transformer } from '../../Transformers/Transformer.ts';
import type {
  MaybeReturn,
  StringKeys
} from '../../Type.ts';
import type { PluginSettingsWrapper } from './PluginSettingsWrapper.ts';
import type {
  ExtractPlugin,
  ExtractPluginSettings,
  ExtractPluginSettingsPropertyNames,
  ExtractPluginSettingsPropertyValues,
  ExtractPluginSettingsWrapper,
  ExtractReadonlyPluginSettingsWrapper,
  PluginTypesBase
} from './PluginTypesBase.ts';

import {
  noop,
  noopAsync
} from '../../Function.ts';
import {
  deepEqual,
  getAllKeys
} from '../../Object.ts';
import { DateTransformer } from '../../Transformers/DateTransformer.ts';
import { DurationTransformer } from '../../Transformers/DurationTransformer.ts';
import { GroupTransformer } from '../../Transformers/GroupTransformer.ts';
import { SkipPrivatePropertyTransformer } from '../../Transformers/SkipPrivatePropertyTransformer.ts';

const defaultTransformer = new GroupTransformer([
  new SkipPrivatePropertyTransformer(),
  new DateTransformer(),
  new DurationTransformer()
]);

type ValidationResult<PluginSettings extends object> = Partial<Record<StringKeys<PluginSettings>, string>>;

type Validator<PluginSettings extends object, PropertyName extends StringKeys<PluginSettings> = StringKeys<PluginSettings>> = (
  value: PluginSettings[PropertyName],
  settings: PluginSettings
) => Promisable<MaybeReturn<string>>;

/**
 * Base class for managing plugin settings.
 *
 * @typeParam PluginTypes - Plugin-specific types.
 */
export abstract class PluginSettingsManagerBase<PluginTypes extends PluginTypesBase> {
  public readonly app: App;

  public readonly defaultSettings: ReadonlyDeep<ExtractPluginSettings<PluginTypes>>;

  /**
   * Gets the current settings wrapper.
   *
   * @returns The current settings wrapper.
   */
  public get settingsWrapper(): ExtractReadonlyPluginSettingsWrapper<PluginTypes> {
    return this.currentSettingsWrapper as ExtractReadonlyPluginSettingsWrapper<PluginTypes>;
  }

  private currentSettingsWrapper: ExtractPluginSettingsWrapper<PluginTypes>;

  private lastSavedSettingsWrapper: ExtractPluginSettingsWrapper<PluginTypes>;
  private readonly propertyNames: ExtractPluginSettingsPropertyNames<PluginTypes>[];
  private readonly validators = new Map<ExtractPluginSettingsPropertyNames<PluginTypes>, Validator<ExtractPluginSettings<PluginTypes>>>();
  /**
   * Creates a new plugin settings manager.
   *
   * @param plugin - The plugin.
   */
  public constructor(public readonly plugin: ExtractPlugin<PluginTypes>) {
    this.app = plugin.app;
    this.defaultSettings = this.createDefaultSettings() as ReadonlyDeep<ExtractPluginSettings<PluginTypes>>;
    this.currentSettingsWrapper = this.createDefaultSettingsWrapper();
    this.lastSavedSettingsWrapper = this.createDefaultSettingsWrapper();
    this.propertyNames = getAllKeys(this.currentSettingsWrapper.settings);
    this.registerValidators();
  }

  /**
   * Edits the plugin settings and saves them.
   *
   * @param settingsEditor - The editor.
   * @param context - The context.
   * @returns A {@link Promise} that resolves when the settings are saved.
   */
  public async editAndSave(settingsEditor: (settings: ExtractPluginSettings<PluginTypes>) => Promisable<void>, context?: unknown): Promise<void> {
    await this.edit(settingsEditor);
    await this.saveToFile(context);
  }

  /**
   * Ensures the settings are safe.
   *
   * It runs validation for each property and sets the default value if the validation fails.
   *
   * @param settings - The settings.
   * @returns A {@link Promise} that resolves when the settings are safe.
   */
  public async ensureSafe(settings: ExtractPluginSettings<PluginTypes>): Promise<void> {
    const validationResult = await this.validate(settings);
    for (const propertyName of this.propertyNames) {
      if (validationResult[propertyName]) {
        settings[propertyName] = this.defaultSettings[propertyName];
      }
    }
  }

  /**
   * Gets a safe copy of the settings.
   *
   * @param settings - The settings.
   * @returns A {@link Promise} that resolves to the safe copy of the settings.
   */
  public async getSafeCopy(settings: ExtractPluginSettings<PluginTypes>): Promise<ExtractPluginSettings<PluginTypes>> {
    const safeSettings = this.cloneSettings(settings);
    await this.ensureSafe(safeSettings);
    return safeSettings;
  }

  /**
   * Loads the plugin settings from the file.
   *
   * @param isInitialLoad - Whether the settings are being loaded for the first time.
   * @returns A {@link Promise} that resolves when the settings are loaded.
   */
  public async loadFromFile(isInitialLoad: boolean): Promise<void> {
    const data = await this.plugin.loadData() as unknown;
    this.lastSavedSettingsWrapper = this.createDefaultSettingsWrapper();
    this.currentSettingsWrapper = this.createDefaultSettingsWrapper();

    if (data === undefined || data === null) {
      return;
    }

    if (typeof data !== 'object') {
      console.error(`Invalid settings from data.json. Expected Object, got: ${typeof data}`);
      return;
    }

    const rawRecord = data as GenericObject;
    const parsedSettings = await this.rawRecordToSettings(rawRecord);
    const validationResult = await this.validate(parsedSettings);

    for (const propertyName of this.propertyNames) {
      this.setPropertyImpl(propertyName, parsedSettings[propertyName], validationResult[propertyName]);
    }

    this.lastSavedSettingsWrapper = this.cloneSettingsWrapper(this.currentSettingsWrapper);

    const newRecord = await this.settingsToRawRecord(this.currentSettingsWrapper.settings);

    if (!deepEqual(newRecord, data)) {
      await this.saveToFileImpl();
    }

    await this.plugin.onLoadSettings(this.currentSettingsWrapper, isInitialLoad);
  }

  /**
   * Saves the new plugin settings.
   *
   * @param context - The context of the save to file operation.
   * @returns A {@link Promise} that resolves when the settings are saved.
   */
  public async saveToFile(context?: unknown): Promise<void> {
    if (deepEqual(this.lastSavedSettingsWrapper.settings, this.currentSettingsWrapper.settings)) {
      return;
    }

    await this.saveToFileImpl();
    await this.plugin.onSaveSettings(this.currentSettingsWrapper, this.lastSavedSettingsWrapper, context);
    this.lastSavedSettingsWrapper = this.cloneSettingsWrapper(this.currentSettingsWrapper);
  }

  /**
   * Sets the value of a property.
   *
   * @typeParam PropertyName - The name of the property.
   * @param propertyName - The name of the property.
   * @param value - The value to set.
   * @returns A {@link Promise} that resolves to the validation message.
   */
  public async setProperty<PropertyName extends ExtractPluginSettingsPropertyNames<PluginTypes>>(
    propertyName: PropertyName,
    value: ExtractPluginSettings<PluginTypes>[PropertyName]
  ): Promise<string> {
    await this.edit((settings) => {
      settings[propertyName] = value;
    });
    return this.currentSettingsWrapper.validationMessages[propertyName];
  }

  /**
   * Validates the settings.
   *
   * @param settings - The settings.
   * @returns A {@link Promise} that resolves to the validation result.
   */
  public async validate(settings: ExtractPluginSettings<PluginTypes>): Promise<ValidationResult<ExtractPluginSettings<PluginTypes>>> {
    const result: ValidationResult<ExtractPluginSettings<PluginTypes>> = {};
    for (const [propertyName, validator] of this.validators.entries()) {
      const validationMessage = await validator(settings[propertyName], settings);
      if (validationMessage) {
        result[propertyName] = validationMessage;
      }
    }

    return result;
  }

  protected abstract createDefaultSettings(): ExtractPluginSettings<PluginTypes>;

  /**
   * Gets the transformer.
   *
   * @returns The transformer.
   */
  protected getTransformer(): Transformer {
    return defaultTransformer;
  }

  /**
   * Called when the plugin settings are loaded.
   *
   * @param _record - The record.
   */
  protected async onLoadRecord(_record: GenericObject): Promise<void> {
    await noopAsync();
  }

  /**
   * Called when the plugin settings are saving.
   *
   * @param _record - The record.
   */
  protected async onSavingRecord(_record: GenericObject): Promise<void> {
    await noopAsync();
  }

  /**
   * Registers a validator for a property.
   *
   * @param propertyName - The name of the property.
   * @param validator - The validator.
   */
  protected registerValidator<PropertyName extends ExtractPluginSettingsPropertyNames<PluginTypes>>(
    propertyName: PropertyName,
    validator: Validator<ExtractPluginSettings<PluginTypes>, PropertyName>
  ): void {
    this.validators.set(propertyName, validator as Validator<ExtractPluginSettings<PluginTypes>>);
  }

  /**
   * Registers the validators.
   *
   * This method can be overridden by subclasses to register validators for properties.
   */
  protected registerValidators(): void {
    noop();
  }

  private cloneSettings(settings: ExtractPluginSettings<PluginTypes>): ExtractPluginSettings<PluginTypes> {
    const record = this.settingsToRawRecord(settings);
    const json = JSON.stringify(record);
    const cloneRecord = JSON.parse(json) as GenericObject;
    return this.rawRecordToSettings(cloneRecord);
  }

  private cloneSettingsWrapper(
    settingsWrapper: PluginSettingsWrapper<ExtractPluginSettings<PluginTypes>>
  ): PluginSettingsWrapper<ExtractPluginSettings<PluginTypes>> {
    return {
      safeSettings: this.cloneSettings(settingsWrapper.safeSettings),
      settings: this.cloneSettings(settingsWrapper.settings),
      validationMessages: { ...settingsWrapper.validationMessages }
    };
  }

  private createDefaultSettingsWrapper(): PluginSettingsWrapper<ExtractPluginSettings<PluginTypes>> {
    return {
      safeSettings: this.createDefaultSettings(),
      settings: this.createDefaultSettings(),
      validationMessages: {} as Record<ExtractPluginSettingsPropertyNames<PluginTypes>, string>
    };
  }

  private async edit(settingsEditor: (settings: ExtractPluginSettings<PluginTypes>) => Promisable<void>): Promise<void> {
    try {
      await settingsEditor(this.currentSettingsWrapper.settings);
    } finally {
      const validationResult = await this.validate(this.currentSettingsWrapper.settings);
      for (const propertyName of this.propertyNames) {
        const validationMessage = validationResult[propertyName] ?? '';
        this.currentSettingsWrapper.validationMessages[propertyName] = validationMessage;
        this.currentSettingsWrapper.safeSettings[propertyName] = validationMessage
          ? this.defaultSettings[propertyName]
          : this.currentSettingsWrapper.settings[propertyName];
      }
    }
  }

  private isValidPropertyName(prop: unknown): prop is ExtractPluginSettingsPropertyNames<PluginTypes> {
    if (typeof prop !== 'string') {
      return false;
    }

    return (this.propertyNames as string[]).includes(prop);
  }

  private async rawRecordToSettings(rawRecord: GenericObject): Promise<ExtractPluginSettings<PluginTypes>> {
    await this.onLoadRecord(rawRecord);

    const settings = this.createDefaultSettings();

    for (const [propertyName, value] of Object.entries(rawRecord)) {
      if (!this.isValidPropertyName(propertyName)) {
        console.warn(`Unknown property: ${propertyName}`);
        continue;
      }

      if (typeof value !== typeof this.defaultSettings[propertyName]) {
        console.warn(
          'Possible invalid value type. It might lead to an unexpected behavior of the plugin. There is also a chance it is a false-negative warning, as we are unable to determine the exact type of the value in runtime.',
          {
            defaultValue: this.defaultSettings[propertyName],
            propertyName,
            value
          }
        );
      }

      settings[propertyName] = value as ExtractPluginSettingsPropertyValues<PluginTypes>;
    }

    return settings;
  }

  private async saveToFileImpl(): Promise<void> {
    await this.plugin.saveData(await this.settingsToRawRecord(this.currentSettingsWrapper));
  }

  private setPropertyImpl(
    propertyName: ExtractPluginSettingsPropertyNames<PluginTypes>,
    value: ExtractPluginSettingsPropertyValues<PluginTypes>,
    validationMessage?: string
  ): void {
    this.currentSettingsWrapper.settings[propertyName] = value;
    this.currentSettingsWrapper.validationMessages[propertyName] = validationMessage ?? '';
    this.currentSettingsWrapper.safeSettings[propertyName] = validationMessage ? this.defaultSettings[propertyName] : value;
  }

  private async settingsToRawRecord(settings: ExtractPluginSettings<PluginTypes>): Promise<GenericObject> {
    const rawRecord: GenericObject = {};

    for (const propertyName of this.propertyNames) {
      rawRecord[propertyName] = settings[propertyName];
    }

    await this.onSavingRecord(rawRecord);

    return this.getTransformer().transformObjectRecursively(rawRecord);
  }
}
