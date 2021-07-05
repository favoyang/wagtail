/* global $ */

import { string } from 'prop-types';
import { escapeHtml as h } from '../../../utils/text';

const sh = function(val) {
  if (!(val instanceof string)) val = val.toString();
  return h(val || '');
};

export class StructBlockValidationError {
  constructor(blockErrors) {
    this.blockErrors = blockErrors;
  }
}

export class StructBlock {
  constructor(blockDef, placeholder, prefix, initialState, initialError) {
    const state = initialState || {};
    this.blockDef = blockDef;
    this.type = blockDef.name;
    const strings = (blockDef.meta && blockDef.meta.strings) || {};

    this.childBlocks = {};
    if (blockDef.meta.formTemplate) {
      const html = blockDef.meta.formTemplate.replace(/__PREFIX__/g, prefix);
      const dom = $(html);
      this.dom = dom;
      $(placeholder).replaceWith(dom);
      this.blockDef.childBlockDefs.forEach(childBlockDef => {
        const childBlockElement = dom.find('[data-structblock-child="' + childBlockDef.name + '"]').get(0);
        const childBlock = childBlockDef.render(
          childBlockElement,
          prefix + '-' + childBlockDef.name,
          state[childBlockDef.name],
          initialError?.blockErrors[childBlockDef.name]
        );
        this.childBlocks[childBlockDef.name] = childBlock;
      });
    } else {
      let dom = $(`
        <div class="${sh(this.blockDef.meta.classname)}">
        </div>
      `);
      this.dom = dom;
      $(placeholder).replaceWith(dom);
      if (this.blockDef.meta.preview) {
        // Preview part.
        const previewDom = $(`
        <div class="preview-part">
          <div class="edit-prompt">${sh(strings.EDIT)}</div>
        </div>
        `);
        this.renderPreview(previewDom, this.blockDef.childBlockDefs, state);
        previewDom.click((event) => {
          // Turn off form preview when clicking the edit area.
          event.preventDefault();
          this.setPreview(false);
        });
        dom.append(previewDom);
        // Edit part.
        const editDom = $(`
          <div class="edit-part invisible">
          </div>
        `);
        dom.append(editDom);
        // Use editDom as the container for later added fields.
        dom = editDom;
      }

      if (this.blockDef.meta.helpText) {
        // help text is left unescaped as per Django conventions
        dom.append(`
          <span>
            <div class="help">
              ${this.blockDef.meta.helpIcon}
              ${this.blockDef.meta.helpText}
            </div>
          </span>
        `);
      }

      this.blockDef.childBlockDefs.forEach(childBlockDef => {
        const childDom = $(`
          <div class="field ${childBlockDef.meta.required ? 'required' : ''}" data-contentpath="${childBlockDef.name}">
            <label class="field__label">${sh(childBlockDef.meta.label)}</label>
            <div data-streamfield-block></div>
          </div>
        `);
        dom.append(childDom);
        const childBlockElement = childDom.find('[data-streamfield-block]').get(0);
        const labelElement = childDom.find('label').get(0);
        const childBlock = childBlockDef.render(
          childBlockElement,
          prefix + '-' + childBlockDef.name,
          state[childBlockDef.name],
          initialError?.blockErrors[childBlockDef.name]
        );

        this.childBlocks[childBlockDef.name] = childBlock;
        if (childBlock.idForLabel) {
          labelElement.setAttribute('for', childBlock.idForLabel);
        }
      });
    }
  }

  renderPreview(previewDom, blockDefs, state) {
    previewDom.append($(this.renderStructBlock(blockDefs, state)));
  }

  renderStructBlock(blockDefs, state) {
    const items = [];
    for (const blockDef of blockDefs) {
      const blockState = state[blockDef.name];
      const blockValue = this.renderBlockValue(blockDef, blockState);
      if (blockValue)
        items.push(`
          <dl>
            <dt>${blockDef.meta.label}</dt>
            <dd class="">${blockValue}</dd>
          </dl>
        `);
    }
    return items.join("\n");
  }

  renderBlockValue(blockDef, blockState) {
    const blockValue = blockState || "";
    const classnames = (blockDef.meta.classname || "").split(" ");
    if (classnames.includes("struct-block")) {
      return this.renderStructBlock(blockDef.childBlockDefs, blockState);
    } else if (blockDef.meta.blockClass === "ListBlock") {
      return this.renderListBlock(blockDef.childBlockDef, blockState);
    } else if (blockDef.meta.blockClass === "ImageChooserBlock") {
      if (!blockState) return "";
      return `<img src="${blockState.preview.url}" />`;
    } else if (blockDef.meta.blockClass === "DocumentChooserBlock") {
      if (!blockState) return "";
      return sh(blockState.title);
    } else if (blockDef.meta.blockClass === "RawHTMLBlock") {
      // Return code without script tag.
      const html = $(blockValue);
      html.find('script').remove();
      return html.wrap("<div>").parent().html();
    } else if (blockDef.meta.blockClass === "NativeColorBlock") {
      if (!blockValue) return "";
      return `<span class='nativecolorvalue' style='background: ${sh(blockValue)};'></span><span>${sh(blockValue)}</span>`;
    } else if (classnames.includes("choice_field")) {
      // Find choices display value if available.
      const val = blockState.length ? blockState[0] : "";
      if (val === "") return "";
      const choices = blockDef.meta.choices || [];
      for (let i = 0; i < choices.length; i++) {
        const choice = choices[i];
        if (choice[0] == val) return sh(choice[1]);
      }
      return sh(val);
    } else if (classnames.includes("char_field")) {
      if (classnames.includes("widget-draftail_rich_text_area")) {
        const data = JSON.parse(blockState)
        if (data && data.blocks) {
          const texts = [];
          for (const blk of data.blocks)
            texts.push(blk.text);
          return sh(texts.join(" "));
        }
      } else return sh(blockValue);
    }
    return sh(blockValue.toString());
  }

  renderListBlock(blockDef, blockStates) {
    const items = [];
    for (const blockState of blockStates) {
      const blockValue = this.renderBlockValue(blockDef, blockState);
      if (blockValue)
        items.push(`
          <dl class="list-item">
            <dd class="">${blockValue}</dd>
          </dl>
        `);
    }
    return items.join("\n");
  }

  // Turn on/off form preview
  setPreview(on) {
    if (on) {
      this.dom.find(".preview-part.invisible").removeClass("invisible");
      this.dom.find(".edit-part").addClass("invisible");
    } else {
      this.dom.find(".preview-part").addClass("invisible");
      this.dom.find(".edit-part.invisible").removeClass("invisible");    }
  }

  setState(state) {
    // eslint-disable-next-line guard-for-in, no-restricted-syntax
    for (const name in state) {
      this.childBlocks[name].setState(state[name]);
    }
  }

  setError(errorList) {
    if (errorList.length !== 1) {
      return;
    }
    const error = errorList[0];

    // eslint-disable-next-line no-restricted-syntax
    for (const blockName in error.blockErrors) {
      if (error.blockErrors.hasOwnProperty(blockName)) {
        this.childBlocks[blockName].setError(error.blockErrors[blockName]);
      }
    }

    // Turn off form preview if has an error.
    this.setPreview(false);
  }

  getState() {
    const state = {};
    // eslint-disable-next-line guard-for-in, no-restricted-syntax
    for (const name in this.childBlocks) {
      state[name] = this.childBlocks[name].getState();
    }
    return state;
  }

  getValue() {
    const value = {};
    // eslint-disable-next-line guard-for-in, no-restricted-syntax
    for (const name in this.childBlocks) {
      value[name] = this.childBlocks[name].getValue();
    }
    return value;
  }

  getTextLabel(opts) {
    /* Use the text label of the first child block to return one */
    for (const childDef of this.blockDef.childBlockDefs) {
      const child = this.childBlocks[childDef.name];
      if (child.getTextLabel) {
        const val = child.getTextLabel(opts);
        if (val) return val;
      }
    }
    // no usable label found
    return null;
  }

  focus(opts) {
    if (this.blockDef.childBlockDefs.length) {
      const firstChildName = this.blockDef.childBlockDefs[0].name;
      this.childBlocks[firstChildName].focus(opts);
    }
  }
}

export class StructBlockDefinition {
  constructor(name, childBlockDefs, meta) {
    this.name = name;
    this.childBlockDefs = childBlockDefs;
    this.meta = meta;
  }

  render(placeholder, prefix, initialState, initialError) {
    return new StructBlock(this, placeholder, prefix, initialState, initialError);
  }
}
