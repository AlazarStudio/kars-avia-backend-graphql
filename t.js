//Пример: Условно есть заявки за 10.03.2026 - 13.03.2026

//Жизненный цикл Request 1 от createdAt -> Done
const t1 = new Date("2026-03-20T15:50:15")
const t2 = new Date("2026-03-20T15:51:05")

//Жизненный цикл Request 2 от createdAt -> Done
const t3 = new Date("2026-03-20T15:52:15")
const t4 = new Date("2026-03-20T15:53:55")

//Жизненный цикл Request 3 от createdAt -> Done
const t5 = new Date("2026-03-20T15:54:00")
const t6 = new Date("2026-03-20T15:58:59")


//Возвращает время в секундах от статуса createdAt - до конечной (done, opened, archive в зависимости от задачи) 
function getRequestProcessingTime(startDate, endDate, inSeconds=true) {
    const startMinutes = startDate.getMinutes() 
    const startSecons = startDate.getSeconds()
    
    const endMinutes = endDate.getMinutes()
    const endSeconds = endDate.getSeconds()
    
    const startTimeInSeconds = startMinutes * 60 + startSecons
    const endTimeInSeconds = endMinutes * 60 + endSeconds

    const allTimeInSeconds = endTimeInSeconds - startTimeInSeconds

    if (inSeconds) {
        return allTimeInSeconds
    }
    else {
        const minutes = Math.trunc(allTimeInSeconds / 60)
        const seconds = allTimeInSeconds - minutes * 60 

        return  { minutes: minutes, 
                  seconds: seconds, 
                  description: `Время обработки заявки от CreatedAt -> Done: ${minutes} минут ${seconds} секунд`
                }
    }
}

console.log(getRequestProcessingTime(t5, t6))

const res1 = getRequestProcessingTime(t1, t2)
const res2 = getRequestProcessingTime(t3, t4)
const res3 = getRequestProcessingTime(t5, t6)


const AverageApplicationReviewTime = (res1 + res2 + res3) / 3


console.log(`Разница по времени между ${t1.toISOString()} и ${t2.toISOString()} = ${typeof(res1) !== "object" ? res1 : res1.description} секунд`)
console.log(`Разница по времени между ${t3.toISOString()} и ${t4.toISOString()} = ${typeof(res2) !== "object" ? res2 : res2.description} секунд`)
console.log(`Разница по времени между ${t5.toISOString()} и ${t6.toISOString()} = ${typeof(res3) !== "object" ? res3 : res3.description} секунд`)
console.log()
console.log(`Среднее время реагирования на заявку за 10.03.2026 - 13.03.2026 (в секундах) = ${AverageApplicationReviewTime}`)
