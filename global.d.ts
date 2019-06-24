declare interface String {
    similarity (s2): any;
    toTitleCase (splitter): string;
    replaceAll (search, replacement): string;
    capitalize (): string
    limitTo (limit): string;
    empty (): boolean;
    indexOfAfter (search, start): string;
    indexOfAfterIndex (search, start): string;
    matches (other): boolean;
    closestMatchIn (list, threshold): string;
    allTrim (): string;
}

declare function log(data: any);
declare function logData(data: any);
declare function checkString(text: string, keyword: RegExp): boolean;
declare function compareStrings(text: string, search: string): boolean;
declare function escapeString(s: string): string;
