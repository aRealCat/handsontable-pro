import { addClass } from 'handsontable/helpers/dom/element';
import { stopImmediatePropagation } from 'handsontable/helpers/dom/event';
import { arrayEach, arrayFilter, arrayMap } from 'handsontable/helpers/array';
import { isKey } from 'handsontable/helpers/unicode';
import * as C from 'handsontable/i18n/constants';
import { unifyColumnValues, intersectValues, toEmptyString } from './../utils';
import BaseComponent from './_base';
import MultipleSelectUI from './../ui/multipleSelect';
import { CONDITION_BY_VALUE, CONDITION_NONE } from './../constants';
import { getConditionDescriptor } from './../conditionRegisterer';

/**
 * @class ValueComponent
 * @plugin Filters
 */
class ValueComponent extends BaseComponent {
  constructor(hotInstance, options) {
    super(hotInstance);

    this.id = options.id;
    this.name = options.name;

    this.elements.push(new MultipleSelectUI(this.hot));

    this.registerHooks();
  }

  /**
   * Register all necessary hooks.
   *
   * @private
   */
  registerHooks() {
    this.getMultipleSelectElement().addLocalHook('keydown', event => this.onInputKeyDown(event));
  }

  /**
   * Set state of the component.
   *
   * @param {Object} value
   */
  setState(value) {
    this.reset();

    if (value && value.command.key === CONDITION_BY_VALUE) {
      const select = this.getMultipleSelectElement();

      select.setItems(value.itemsSnapshot);
      select.setValue(value.args[0]);
    }
  }

  /**
   * Export state of the component (get selected filter and filter arguments).
   *
   * @returns {Object} Returns object where `command` key keeps used condition filter and `args` key its arguments.
   */
  getState() {
    const select = this.getMultipleSelectElement();
    const availableItems = select.getItems();

    return {
      command: { key: select.isSelectedAllValues() || !availableItems.length ? CONDITION_NONE : CONDITION_BY_VALUE },
      args: [select.getValue()],
      itemsSnapshot: availableItems
    };
  }

  /**
   * Update state of component.
   *
   * @param {Object} stateInfo Information about state containing stack of edited column,
   * stack of dependent conditions, data factory and optional condition arguments change. It's described by object containing keys:
   * `editedConditionStack`, `dependentConditionStacks`, `visibleDataFactory` and `conditionArgsChange`.
   */
  updateState(stateInfo) {
    const updateColumnState = (column, conditions, conditionArgsChange, filteredRowsFactory, conditionsStack) => {
      const [firstByValueCondition] = arrayFilter(conditions, condition => condition.name === CONDITION_BY_VALUE);
      const state = {};
      const defaultBlankCellValue = this.hot.getTranslatedPhrase(C.FILTERS_VALUES_BLANK_CELLS);

      if (firstByValueCondition) {
        let rowValues = arrayMap(filteredRowsFactory(column, conditionsStack), row => row.value);

        rowValues = unifyColumnValues(rowValues);

        if (conditionArgsChange) {
          firstByValueCondition.args[0] = conditionArgsChange;
        }

        const selectedValues = [];
        const itemsSnapshot = intersectValues(rowValues, firstByValueCondition.args[0], defaultBlankCellValue, (item) => {
          if (item.checked) {
            selectedValues.push(item.value);
          }
        });

        state.args = [selectedValues];
        state.command = getConditionDescriptor(CONDITION_BY_VALUE);
        state.itemsSnapshot = itemsSnapshot;

      } else {
        state.args = [];
        state.command = getConditionDescriptor(CONDITION_NONE);
      }

      this.setCachedState(column, state);
    };

    updateColumnState(
      stateInfo.editedConditionStack.column,
      stateInfo.editedConditionStack.conditions,
      stateInfo.conditionArgsChange,
      stateInfo.filteredRowsFactory
    );

    // Shallow deep update of component state
    if (stateInfo.dependentConditionStacks.length) {
      updateColumnState(
        stateInfo.dependentConditionStacks[0].column,
        stateInfo.dependentConditionStacks[0].conditions,
        stateInfo.conditionArgsChange,
        stateInfo.filteredRowsFactory,
        stateInfo.editedConditionStack
      );
    }
  }

  /**
   * Get multiple select element.
   *
   * @returns {MultipleSelectUI}
   */
  getMultipleSelectElement() {
    return this.elements.filter(element => element instanceof MultipleSelectUI)[0];
  }

  /**
   * Get object descriptor for menu item entry.
   *
   * @returns {Object}
   */
  getMenuItemDescriptor() {
    return {
      key: this.id,
      name: this.name,
      isCommand: false,
      disableSelection: true,
      hidden: () => this.isHidden(),
      renderer: (hot, wrapper, row, col, prop, value) => {
        addClass(wrapper.parentNode, 'htFiltersMenuValue');

        const label = document.createElement('div');

        addClass(label, 'htFiltersMenuLabel');
        label.textContent = value;

        wrapper.appendChild(label);
        arrayEach(this.elements, ui => wrapper.appendChild(ui.element));

        return wrapper;
      }
    };
  }

  /**
   * Reset elements to their initial state.
   */
  reset() {
    const defaultBlankCellValue = this.hot.getTranslatedPhrase(C.FILTERS_VALUES_BLANK_CELLS);
    if (this.hot.getSettings().dynamicFilter === true) {
      this._getColumnVisibleValuesDynamically().then(data => {
        let values = unifyColumnValues(data.base)
        let items = intersectValues(values, data.selected || values, defaultBlankCellValue)
        this.getMultipleSelectElement().setItems(items);
        super.reset();
      })
    } else {
      const values = unifyColumnValues(this._getColumnVisibleValues());
      const items = intersectValues(values, values, defaultBlankCellValue);

      this.getMultipleSelectElement().setItems(items);
      super.reset();
      this.getMultipleSelectElement().setValue(values);
    }
    // const defaultBlankCellValue = this.hot.getTranslatedPhrase(C.FILTERS_VALUES_BLANK_CELLS);
    // const values = unifyColumnValues(this._getColumnVisibleValues());
    // const items = intersectValues(values, values, defaultBlankCellValue);

    // this.getMultipleSelectElement().setItems(items);
    // super.reset();
    // this.getMultipleSelectElement().setValue(values);
  }

  /**
   * Key down listener.
   *
   * @private
   * @param {Event} event DOM event object.
   */
  onInputKeyDown(event) {
    if (isKey(event.keyCode, 'ESCAPE')) {
      this.runLocalHooks('cancel');
      stopImmediatePropagation(event);
    }
  }

  /**
   * Get data for currently selected column.
   *
   * @returns {Array}
   * @private
   */
  _getColumnVisibleValues() {
    const lastSelectedColumn = this.hot.getPlugin('filters').getSelectedColumn();
    const visualIndex = lastSelectedColumn && lastSelectedColumn.visualIndex;

    return arrayMap(this.hot.getDataAtCol(visualIndex), v => toEmptyString(v));
  }

  /**
   * Get data for currently selected column dynamicly
   */
  _getColumnVisibleValuesDynamically() {
    return new Promise((resolve, reject) => {
      let storePlugin = this.hot.getPlugin('StorePlugin');
      let dynamicFilterSettings = storePlugin.dynamicFilterSettings;
      let url = dynamicFilterSettings.getFilterOptionUrl;
      let lastSelectAllCol = dynamicFilterSettings.selectAllCol;
      let filteredCol = dynamicFilterSettings.filteredCol;

      let filter = this.hot.getPlugin('filters');
      let lastFilterCol = filter.lastFilterCol ? filter.lastFilterCol.visualIndex : undefined;
      let currentSelectedCol = filter.getSelectedColumn().visualIndex;

      let bodyStyle = storePlugin.style.body;
      let checkboxCol = bodyStyle.checkboxCol || [];
      let forbidFilterCol = bodyStyle.forbidFilterCol || [];
      let currentColName = bodyStyle.colData[currentSelectedCol];
      let http = storePlugin.http

      let postData = {
        _csrf: storePlugin._csrf,
        _tabId: storePlugin.menuId,
        filterColName: currentColName,
        paginationOptions: storePlugin.paginationOptions
      };
      let temp = [];
      let selected = [];

      if (forbidFilterCol.indexOf(currentColName) !== -1) {
        reject({
          base: temp
        });
      }
      if (checkboxCol.indexOf(currentColName) !== -1) {
        temp = ['是', '否'];
        resolve({
          base: temp
        });
      } else if (currentColName === 'verify_state') {
        temp = ['取消关闭', '关闭单据'];
        resolve({
          base: temp
        });
      } else if (lastFilterCol === currentSelectedCol) {
        let all = filter.itemsSnapshotCopy;
        let base = [];
        let selected = [];
        for (let i = 0; i < all.length; i++) {
          base.push(all[i].value);
          if (all[i].checked === true) {
            selected.push(all[i].value);
          }
        }
        resolve({
          base: base,
          selected: selected
        });
      } else if (lastFilterCol === undefined || (lastFilterCol !== undefined && lastFilterCol !== currentSelectedCol)) {
        postData.special = false;
        if (filteredCol && currentColName === filteredCol[filteredCol.length - 1]) {
          postData.paginationOptions.filter[lastSelectAllCol] = undefined;
          postData.special = true;
        }
        if (filteredCol && filteredCol.indexOf(currentColName) !== -1) {
          postData.special = true;
        }
        http({url, data: postData}).then(res => {
          let optionValue = res.data;
          if (currentColName === 'state') {
            for (let i = 0; i < optionValue.length; i++) {
              switch (optionValue[i].data + '') {
                case '0':
                  optionValue[i].data = '未审核'
                  break;
                case '1':
                  optionValue[i].data = '已审核'
                  break;
                case '2':
                  optionValue[i].data = '已下单'
                  break;
                case '3':
                  optionValue[i].data = '已提单'
                  break;
                case '-1':
                  optionValue[i].data = '废除'
                  break;
                default:
                  break;
              }
            }
          } else if (currentColName === 'finishStatus') {
            for (var i = 0; i < optionValue.length; i++) {
              switch (optionValue[i].data + '') {
                case '0':
                  optionValue[i].data = '未收货'
                  break;
                case '1':
                  optionValue[i].data = '收货中'
                  break;
                case '2':
                  optionValue[i].data = '完成'
                  break;
                case '3':
                  optionValue[i].data = '废除'
                  break;
                case '4':
                  optionValue[i].data = '转单'
                  break;
                case '5':
                  optionValue[i].data = '超单'
                  break;
                default:
                  break;
              }
            }
          } else if (currentColName === 'status') {
            for (var i = 0; i < optionValue.length; i++) {
              switch (optionValue[i].data + '') {
                case '0':
                  optionValue[i].data = '编辑中'
                  break;
                case '1':
                  optionValue[i].data = '已保存'
                  break;
                case '2':
                  optionValue[i].data = '已生成订单'
                  break;
                default:
                  break;
              }
            }
          } else if (currentColName === 'logistics_status') {
            for (var i = 0; i < optionValue.length; i++) {
              switch (optionValue[i].data + '') {
                case '0':
                  optionValue[i].data = '未收货';
                  break;
                case '1':
                  optionValue[i].data = '收货中';
                  break;
                case '2':
                  optionValue[i].data = '完成';
                  break;
                case '3':
                  optionValue[i].data = '废除';
                  break;
                case '4':
                  optionValue[i].data = '转单';
                  break;
                case '5':
                  optionValue[i].data = '超单';
                  break;
                default:
                  break;
              }
            }
          }

          for (let i = 0; i < optionValue.length; i++) {
            temp.push(optionValue[i].data)
            if (optionValue[i].selected) {
              selected.push(optionValue[i].data)
            }
          }
          resolve({
            base: temp,
            selected: selected
          });
        }, res => {
          reject(res)
        })
      }
    })
  }
}

export default ValueComponent;
