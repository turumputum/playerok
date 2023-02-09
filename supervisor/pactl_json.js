const [alsa, elements] = pacmd(true)
//basics(alsa)
sources_and_sinks(alsa)

function basics(alsa) {
  // Get sections as flat structure
  // const [sections, elements] = pacmd()
  // Get sections as tree
  // console.log("alsa=" + JSON.stringify(alsa, null, 2))
  console.log("Sections in ALSA: " + Object.keys(alsa).join(", "))
  Object.keys(alsa).forEach(section => {
    console.log("Number of " + section + ": " + alsa[section].entries.length)
    alsa[section].entries.forEach(entry => {
      console.log(`-- name=${entry.key} [${Object.keys(entry.properties).length} properties]: ${Object.keys(entry.properties).join(", ")}`)
      //console.log(`-- ${JSON.stringify(entry,null,2)}: name=${entry.name}`)
    })
  })
}

function sources_and_sinks(alsa) {
  const properties = {
    "sinks": "name, driver, flags, state, suspend cause, priority, volume, base volume, volume steps, muted, current latency, max request, max rewind, monitor source, sample spec, channel map, used by, linked by, configured latency, card, module, properties:, ports:, active port".split(", "),
    "sources": "name, driver, flags, state, suspend cause, priority, volume, base volume, volume steps, muted, current latency, max rewind, sample spec, channel map, used by, linked by, configured latency,  monitor_of, card, module, properties:, ports:, active port".split(", "),
    "cards": "name, driver, owner module, properties:, profiles:, active profile, sinks:, sources:, ports:".split(", "),
    "sink inputs": "driver, flags, state, sink, volume, muted, current latency, requested latency, sample spec, channel map, resample method, module, client, properties:".split(", "),
    "source outputs": "driver, flags, state, source, volume, muted, current latency, requested latency, sample spec, channel map, resample method, owner module, client, properties:".split(", ")
  }

  Object.keys(properties).forEach(s => {
    console.log(s)
    let i=0
    const total = alsa[s].entries.length
    alsa[s].entries.forEach(index => {
      i++
      console.log(` -- ${s} [${i}/${total}] => ${index.key}=${index.value} [star=${index.starred}]`)
      properties[s].forEach(x => {
        const value = index.properties[x] && index.properties[x].value ? index.properties[x].value : ""
        console.log(`    -- ${x}=${value}`)
      })
    })
  })
}

function pacmd(as_tree) {
  const child_process = require('child_process')
  const stdout = child_process.execSync("pacmd list")
  //console.log(stdout.toString())
  const [sections, length] = process(stdout.toString())
  console.log(`Total elements: ${length}.`)
  if (!as_tree) {
    return [sections, length]
  } else {
    const alsa = make_tree(sections)
    return [alsa, length]
  }

  function make_tree(sections) {
    let alsa = {}
    Object.keys(sections).forEach(section => {
      if (sections[section].length > 1) {
        // messages
        alsa[section] = sections[section].reduce(array_to_object, {})
        alsa[section]["entries"] = []
      } else {
        if (!sections[section][0].p) {
          // one section, but no ps
          alsa[section] = sections[section][0].data
          alsa[section]["entries"] = []
        } else {
          // other: Only one entry and ps
          alsa[section] = sections[section][0]
          //console.log(typeof(alsa[section].p))
          if (Array.isArray(alsa[section].p)) {
            //console.log(alsa[section].p.length)
            alsa[section]["entries"] = alsa[section].p.map(x => {
              return {
                ...x.data,
                properties: x.p.reduce(array_to_object, {})
              }
            })
            delete alsa[section].p
            alsa[section] = { ...alsa[section].data, entries: alsa[section].entries }
          } else {
            // console.log("xxxx=" + JSON.stringify(alsa[section], null, 2))
            console.log("ERROR xxxx=" + JSON.stringify(alsa[section], null, 2))
            process.exit(1)
          }
        }
      }
    })
    return alsa
  }

  function array_to_object(obj, item) {
    let x = {}
    if (item.p) {
      x = item.p
      if (Array.isArray(item.p)) {
        x = x.reduce(array_to_object, {})
        delete item.p
      } else {
        console.log("p non-array")
        process.exit(1)
      }
    }
    let newkey = item.data.key ? item.data.key : "no_key"
    while (obj[newkey]) {
      newkey = newkey + "_"
    }
    obj[newkey] = { ...item.data, ...x }
    try {
    } catch (e) {
      console.log(`ERROR=${e}\n` + JSON.stringify(item, null, 2))
    }
    return obj
  }

  function process(stdout) {
    //console.log(stdout)
    const flat = flatten(stdout)
    const [data, max] = objectify(0, flat, 0)
    const sections = makeSections(data)
    return [sections, flat.length]
  }

  function makeSections(flat) {
    let mysection = "messages"
    let out = {
      messages: []
    }
    flat.forEach(element => {
      if (element.data.level == 0) {
        if (element.data.section != "") {
          mysection = element.data.section
          if (!out[mysection])
            out[mysection] = []
        } else {
          mysection = "messages"
        }
      }
      out[mysection].push(element)
    })
    return out
  }

  function objectify(level, s, index) {
    let data = []
    if (index >= s.length - 1)
      return [data, index]
    while (index < s.length - 1) {
      if (s[index].data.level == level) {
        data.push(s[index])
        index++
      }
      if (s[index].data.level > level) {
        // p for property
        [data[data.length - 1]["p"], index] = objectify(s[index].data.level, s, index)
      }
      if (s[index].data.level < level) {
        return [data, index]
      }
    }
    return [data, index]
  }

  function flatten(stdout) {
    const arr = stdout.split("\n")
    let j = -1
    const flat = arr.map(line => {
      line = line.replace(/\t/g, "      ")
      const i = line.match(/^(\s*)/)[1].length
      const l = line.replace(/^(\s*)/, "")
      const x = l.match(/^([^\:]+)\: (.*)$/)
      const y = l.match(/^([^\=]+) \= \"(.*)\"$/)
      let key = ""
      let val = ""
      let type = ""
      if (x) {
        key = x[1]
        val = x[2]
        type = ":"
      } else if (y) {
        key = y[1]
        val = y[2]
        type = "="
      } else {
        key = l
      }
      const level = i == 0 ? 0 :
        i < 6 ? 1 :
          i % 6 == 0 ? i / 6 + 1 : i / 6 + 1
      const z = line.match(/(\d+)\s+([\w ]+)\(s\) (loaded|available|logged in)\./)
      const number = z ? z[1] : ""
      const section = z ? z[2] + "s" : ""
      const star = key.match(/^\* (.*)$/)
      key = key.replace(/^(\* )/, "")
      const mykey = key
      const starred = star ? true : false
      j++
      let out = {}
      return {
        data: {
          key: section ? section : mykey,
          value: number ? number : val,
          starred: starred,
          original_key: mykey,
          original_value: val,
          type: type,
          section: section,
          number_in_section: number,
          level: level,
          indentation: i,
          sequence: j,
        }
      }
    })
    return flat
  } 
}