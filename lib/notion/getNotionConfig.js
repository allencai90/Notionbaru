/**
 * 从Notion中读取站点配置;
 * 在Notion模板中创建一个类型为CONFIG的页面，再添加一个数据库表格，即可用于填写配置
 * Notion数据库配置优先级最高，将覆盖vercel环境变量以及blog.config.js中的配置
 * --注意--
 * 数据库请从模板复制 https://www.notion.so/tanghh/287869a92e3d4d598cf366bd6994755e
 *
 */
import { getDateValue, getTextContent } from 'notion-utils'
import { deepClone } from '../utils'
import getAllPageIds from './getAllPageIds'
import { getPage } from './getPostBlocks'

/**
 * 专门修复序列化错误：将对象中所有的 undefined 替换为 null
 */
function JSONSerializable(obj) {
  try {
    return JSON.parse(JSON.stringify(obj, (key, value) =>
      typeof value === 'undefined' ? null : value
    ))
  } catch (e) {
    return obj
  }
}

/**
 * 从Notion中读取Config配置表
 * @param {*} allPages
 * @returns
 */
export async function getConfigMapFromConfigPage(allPages) {
  // 默认返回配置文件
  const notionConfig = {}

  if (!allPages || !Array.isArray(allPages) || allPages.length === 0) {
    console.warn('[Notion配置] 忽略的配置')
    return null
  }
  // 找到Config类
  const configPage = allPages?.find(post => {
    return (
      post &&
      post?.type &&
      (post?.type === 'CONFIG' ||
        post?.type === 'config' ||
        post?.type === 'Config')
    )
  })

  if (!configPage) {
    return null
  }
  const configPageId = configPage.id
  let pageRecordMap = await getPage(configPageId, 'config-table')
  
  if (!pageRecordMap?.block?.[configPageId]?.value) {
      return null
  }

  let content = pageRecordMap.block[configPageId].value.content
  for (const table of ['Config-Table', 'CONFIG-TABLE']) {
    if (content) break
    pageRecordMap = await getPage(configPageId, table)
    content = pageRecordMap?.block?.[configPageId]?.value?.content
  }

  if (!content) {
    return null
  }

  // 找到PAGE文件中的database
  const configTableId = content?.find(contentId => {
    return pageRecordMap.block[contentId]?.value?.type === 'collection_view'
  })

  if (!configTableId) {
    return null
  }

  // 页面查找
  const databaseRecordMap = pageRecordMap.block[configTableId]
  const block = pageRecordMap.block || {}
  const rawMetadata = databaseRecordMap?.value
  
  // 检查 Type Page-Database和Inline-Database
  if (
    rawMetadata?.type !== 'collection_view_page' &&
    rawMetadata?.type !== 'collection_view'
  ) {
    // 这里不再使用 console.error 阻塞进程
    console.warn(`[跳过] pageId "${configTableId}" 不是有效的数据库格式`)
    return null
  }

  const collectionId = rawMetadata?.collection_id
  if (!collectionId || !pageRecordMap.collection[collectionId]) {
      return null
  }

  const collection = pageRecordMap.collection[collectionId].value
  const collectionQuery = pageRecordMap.collection_query
  const collectionView = pageRecordMap.collection_view
  const schema = collection?.schema
  const viewIds = rawMetadata?.view_ids
  const pageIds = getAllPageIds(
    collectionQuery,
    collectionId,
    collectionView,
    viewIds
  )

  if (!pageIds || pageIds?.length === 0) {
    return null
  }

  // 遍历用户的表格
  for (let i = 0; i < pageIds.length; i++) {
    const id = pageIds[i]
    const value = block[id]?.value
    if (!value) {
      continue
    }
    const rawProperties = Object.entries(block?.[id]?.value?.properties || [])
    const excludeProperties = ['date', 'select', 'multi_select', 'person']
    const properties = {}
    for (let j = 0; j < rawProperties.length; j++) {
      const [key, val] = rawProperties[j]
      properties.id = id
      if (schema[key]?.type && !excludeProperties.includes(schema[key].type)) {
        properties[schema[key].name] = getTextContent(val)
      } else {
        switch (schema[key]?.type) {
          case 'date': {
            const dateProperty = getDateValue(val)
            if (dateProperty) {
                delete dateProperty.type
                properties[schema[key].name] = dateProperty
            }
            break
          }
          case 'select':
          case 'multi_select': {
            const selects = getTextContent(val)
            if (selects && typeof selects === 'string' && selects.length > 0) {
              properties[schema[key].name] = selects.split(',')
            } else if (Array.isArray(selects)) {
              properties[schema[key].name] = selects
            }
            break
          }
          default:
            break
        }
      }
    }

    if (properties) {
      // 将表格中的字段映射成 英文
      const config = {
        enable: (properties['启用'] || properties.Enable) === 'Yes',
        key: properties['配置名'] || properties.Name,
        value: properties['配置值'] || properties.Value
      }

      // 只导入生效的配置
      if (config.enable && config.key) {
        notionConfig[config.key] =
          parseTextToJson(config.value) || config.value || null
      }
    }
  }

  let combine = notionConfig
  try {
    combine = Object.assign(
      {},
      deepClone(notionConfig),
      notionConfig?.INLINE_CONFIG
    )
  } catch (err) {
    console.warn('解析 INLINE_CONFIG 配置时出错', err)
  }
  
  // 最后一步：确保所有数据都是 JSON 安全的
  return JSONSerializable(combine)
}

/**
 * 解析INLINE_CONFIG
 * @param {*} configString
 * @returns
 */
export function parseConfig(configString) {
  if (!configString || typeof configString !== 'string') {
    return {}
  }
  try {
    // eslint-disable-next-line no-eval
    const config = eval('(' + configString + ')')
    return config
  } catch (evalError) {
    return {}
  }
}

/**
 * 解析文本为JSON
 * @param text
 * @returns {any|null}
 */
export function parseTextToJson(text) {
  if (!text || typeof text !== 'string') return null
  try {
    return JSON.parse(text)
  } catch (error) {
    return null
  }
}
