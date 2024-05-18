import { conjugateRuleDb, indexDb, specialRuleDb } from 'main';

/**
 * convert a verb conjugation to basic form.
 * 还原用言的活用变形
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
export function scan_input_string(input_text: string): string[] {
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
