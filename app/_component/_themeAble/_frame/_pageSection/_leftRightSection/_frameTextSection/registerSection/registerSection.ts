import declareComponent from "../../../../../../../lib/declareComponent"
import FrameTextSection from "../frameTextSection"
import { BodyTypes } from "./pugBody.gen"; import "./pugBody.gen"

export default class RegisterSection extends FrameTextSection {
  protected body: BodyTypes

  constructor() {
    super()





    // is date between 1 Oktober – Februar boolean
    let isInAnmeldungsZeitraum = (() => {
      const now = new Date()
      const year = now.getFullYear()
      
      // Find first Monday in February
      const feb1 = new Date(year, 1, 1) // February is month 1
      let firstMonday = new Date(feb1)
      const dayOfWeek = feb1.getDay()
      const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7
      firstMonday.setDate(feb1.getDate() + daysUntilMonday)
      
      // Add 3 weeks (19 days) excl weekend after
      const endDate = new Date(firstMonday)
      endDate.setDate(firstMonday.getDate() + 19)
      
      // Start of Anmeldezeitraum: October 1st
      const oktStart = new Date(year, 9, 1) // October is month 9
      
      // Check if we're in the registration period
      if (now >= endDate && now < oktStart) {
        return false // NOT in Anmeldezeitraum
      }
      
      // Handle year boundary: if before endDate, check previous year's October
      if (now < endDate) {
        const prevOktStart = new Date(year - 1, 9, 1)
        return now >= prevOktStart
      }
      
      return true // After Oct 1st of current year
    })()

    // isInAnmeldungsZeitraum = false


    if (!isInAnmeldungsZeitraum) {
      this.body.registerBtn.enabled.set(false)
      this.body.alternativeAnmeldungText.show()
      this.body.registerText.hide()
    }
    else {
      this.body.registerBtn.enabled.set(true)
      this.body.alternativeAnmeldungText.hide()
      this.body.registerText.show()
    }


  }

  stl() {
    return super.stl() + require("./registerSection.css").toString()
  }
  pug() {
    return require("./registerSection.pug").default
  }
}

declareComponent("c-register-section", RegisterSection)

// const calEmbedStr = require("./calEmbed.txt")

// document.body.insertAdjacentHTML("beforeend", calEmbedStr)


// //@ts-ignore
// console.log("Cal1");
//   (function (C, A, L) { let p = function (a, ar) { a.q.push(ar); }; let d = C.document; C.Cal = C.Cal || function () { let cal = C.Cal; let ar = arguments; if (!cal.loaded) { cal.ns = {}; cal.q = cal.q || []; d.head.appendChild(d.createElement("script")).src = A; cal.loaded = true; } if (ar[0] === L) { const api = function () { p(api, arguments); }; const namespace = ar[1]; api.q = api.q || []; if(typeof namespace === "string"){cal.ns[namespace] = cal.ns[namespace] || api;p(cal.ns[namespace], ar);p(cal, ["initNamespace", namespace]);} else p(cal, ar); return;} p(cal, ar); }; })(window, "https://app.cal.com/embed/embed.js", "init");
//   //@ts-ignore
// Cal("init", "ko50-anmeldung", {origin:"https://app.cal.com"});

  
//   // Important: Please add the following attributes to the element that should trigger the calendar to open upon clicking.
//   // `data-cal-link="maximilian-mairinger-vhhdpg/ko50-anmeldung"`
//   // data-cal-namespace="ko50-anmeldung"
//   // `data-cal-config='{"layout":"month_view","useSlotsViewOnSmallScreen":"true","theme":"light"}'`
// //@ts-ignore
//   Cal.ns["ko50-anmeldung"]("ui", {"theme":"light","cssVarsPerTheme":{"light":{"cal-brand":"#00d700"}},"hideEventTypeDetails":false,"layout":"month_view"});
//   //@ts-ignore
//   window.Cal = Cal
//   //@ts-ignore
//   console.log(Cal)
  

//   console.log("Cal2")