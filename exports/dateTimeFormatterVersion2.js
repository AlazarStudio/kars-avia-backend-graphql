export const dateFormatter =(inputDate) => {

    if (inputDate !== null && inputDate !== undefined ){
        const lst = inputDate.toLocaleDateString().split('.')     // DD.MM.YYYY -> [ "DD", "MM", "YYYY" ]
        
        const yearMonthDate = lst[2] + "-" + lst[1] + "-" + lst[0]  // -> YYYY-MM-DD
        const hour = inputDate.getHours()     
        const minute = inputDate.getMinutes()
        const second = inputDate.getSeconds()
        
        const moscowDate = {
            yearMonthDate: yearMonthDate,
            hour: hour >= 0 && hour <= 9 ? `0${hour}`: `${hour}`,
            minute: minute >= 0 && minute <= 9 ? `0${minute}`: `${minute}`,
            second: second >= 0 && second <= 9 ? `0${second}`: `${second}`,
        }
        return `${moscowDate["yearMonthDate"]}T${moscowDate["hour"]}:${moscowDate["minute"]}:${moscowDate["second"]}`
    }
    return

    




    //  VERSION 3

    // const strLocalInputDate = inputDate.toLocaleString()      // DD.MM.YYYY, HH:MM:SS

    // const yearMonthDayLst = strLocalInputDate.split(', ')[0].split('.')   //  DD.MM.YYYY, HH:MM:SS   -->   ["DD.MM.YYYY", "HH:MM:SS"]   -->   "DD.MM.YYYY"   -->   ["DD", "MM", "YYYY"] 
    // const time = strLocalInputDate.split(', ')[1]  // DD.MM.YYYY, HH:MM:SS   -->    ["DD.MM.YYYY", "HH:MM:SS"]    -->    "HH:MM:SS"

    // const yearMonthDay = `${yearMonthDayLst[2]}-${yearMonthDayLst[1]}-${yearMonthDayLst[0]}`    // YYYY-MM-DD

    // return `${yearMonthDay}T${time}`
}